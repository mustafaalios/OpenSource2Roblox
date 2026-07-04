using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RobloxFiles;
using RobloxFiles.DataTypes;

namespace Source2Roblox.Util
{
    public sealed class RobloxAssetResolver
    {
        private const string AssetsUrl = "https://apis.roblox.com/assets/v1/assets";
        private const string OperationsUrl = "https://apis.roblox.com/assets/v1/operations";
        private const int UploadIntervalMs = 510;
        private static readonly HttpClient Client = new HttpClient();
        private static readonly SemaphoreSlim UploadSlots = new SemaphoreSlim(8, 8);
        private static readonly object RateLock = new object();
        private static DateTime nextUploadStart = DateTime.MinValue;

        private readonly string rootDir;
        private readonly string localAssetRoot;
        public RobloxAssetResolver(string rootDir, string localAssetRoot)
        {
            this.rootDir = rootDir;
            this.localAssetRoot = localAssetRoot;
        }

        public void BindTexture(string localPath, List<Task> uploadPool, Instance target, string property)
        {
            Bind(localPath, "Image", "image/png", uploadPool, target, property);
        }

        public void BindTexture(string localPath, List<Task> uploadPool, Property targetProperty)
        {
            Bind(localPath, "Image", "image/png", uploadPool, targetProperty);
        }

        public void BindMesh(string localPath, List<Task> uploadPool, Instance target, string property)
        {
            if (!Program.UploadMeshes)
            {
                SetProperty(target, property, LocalAsset(localPath));
                return;
            }

            Bind(localPath, "Mesh", "model/x-file-mesh-data", uploadPool, target, property);
        }

        private void Bind(
            string localPath,
            string assetType,
            string contentType,
            List<Task> uploadPool,
            Instance target,
            string property
        )
        {
            string normPath = NormalizeLocalPath(localPath);
            bool isExcluded = false;
            foreach (var excluded in Program.ExcludedTextures)
            {
                if (normPath.IndexOf(excluded, StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    isExcluded = true;
                    break;
                }
            }

            if (isExcluded || !Program.UploadAssets || !Program.HasRobloxUploadCredentials)
            {
                if (isExcluded)
                    Program.Emit("raw", $"Skipping cloud upload for excluded asset: {localPath}");

                SetProperty(target, property, LocalAsset(normPath));
                return;
            }

            string assetId;

            try
            {
                assetId = ResolveAsync(localPath, assetType, contentType).GetAwaiter().GetResult();
            }
            catch (Exception e)
            {
                Program.Emit("raw", $"Roblox rejected {localPath}; using the local asset instead. {e.Message}");
                SetProperty(target, property, LocalAsset(normPath));
                return;
            }

            if (string.IsNullOrEmpty(assetId))
                return;

            RequireUploadedAsset(assetId, localPath);
            SetProperty(target, property, assetId);
        }

        private void Bind(
            string localPath,
            string assetType,
            string contentType,
            List<Task> uploadPool,
            Property targetProperty
        )
        {
            string normPath = NormalizeLocalPath(localPath);
            bool isExcluded = false;
            foreach (var excluded in Program.ExcludedTextures)
            {
                if (normPath.IndexOf(excluded, StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    isExcluded = true;
                    break;
                }
            }

            if (isExcluded || !Program.UploadAssets || !Program.HasRobloxUploadCredentials)
            {
                if (isExcluded)
                    Program.Emit("raw", $"Skipping cloud upload for excluded asset: {localPath}");

                SetPropertyValue(targetProperty, LocalAsset(normPath));
                return;
            }

            string assetId;

            try
            {
                assetId = ResolveAsync(localPath, assetType, contentType).GetAwaiter().GetResult();
            }
            catch (Exception e)
            {
                Program.Emit("raw", $"Roblox rejected {localPath}; using the local asset instead. {e.Message}");
                SetPropertyValue(targetProperty, LocalAsset(normPath));
                return;
            }

            if (string.IsNullOrEmpty(assetId))
                return;

            RequireUploadedAsset(assetId, localPath);
            SetPropertyValue(targetProperty, assetId);
        }

        private Task<string> ResolveAsync(string localPath, string assetType, string contentType)
        {
            string normalizedPath = NormalizeLocalPath(localPath);
            string filePath = Path.Combine(rootDir, normalizedPath.Replace('/', Path.DirectorySeparatorChar));

            if (!File.Exists(filePath))
            {
                Program.Emit("raw", $"Skipped missing upload file: {filePath}");
                return Task.FromResult<string>(null);
            }

            return UploadAsync(filePath, assetType, contentType);
        }

        private async Task<string> UploadAsync(
            string filePath,
            string assetType,
            string contentType
        )
        {
            string cachedId = AssetUploadCache.GetCachedAssetId(filePath, assetType, Program.RobloxCreatorType, Program.RobloxCreatorId);
            if (!string.IsNullOrEmpty(cachedId))
            {
                Program.Emit("raw", $"Using cached asset ID for {Path.GetFileName(filePath)}: {cachedId}");
                return cachedId;
            }

            string assetId = await CreateAssetAsync(filePath, assetType, contentType).ConfigureAwait(false);
            string formattedAssetId = "rbxassetid://" + assetId;

            AssetUploadCache.SetCachedAssetId(filePath, assetType, Program.RobloxCreatorType, Program.RobloxCreatorId, formattedAssetId);
            return formattedAssetId;
        }

        private async Task<string> CreateAssetAsync(string filePath, string assetType, string contentType)
        {
            await UploadSlots.WaitAsync().ConfigureAwait(false);

            try
            {
                await WaitForRateSlotAsync().ConfigureAwait(false);

                string name = Path.GetFileNameWithoutExtension(filePath);
                object creator = Program.RobloxCreatorType == "group"
                    ? new { groupId = Program.RobloxCreatorId } as object
                    : new { userId = Program.RobloxCreatorId };
                string requestJson = JsonConvert.SerializeObject(new
                {
                    assetType,
                    displayName = TrimName(name),
                    description = "Generated by Source2Roblox",
                    creationContext = new { creator }
                });

                using (var form = new MultipartFormDataContent())
                using (var requestPart = new StringContent(requestJson))
                using (var stream = File.OpenRead(filePath))
                using (var filePart = new StreamContent(stream))
                using (var request = new HttpRequestMessage(HttpMethod.Post, AssetsUrl))
                {
                    requestPart.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/json");
                    filePart.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(contentType);
                    form.Add(requestPart, "request");
                    form.Add(filePart, "fileContent", Path.GetFileName(filePath));
                    request.Headers.Add("x-api-key", Program.RobloxApiKey);
                    request.Content = form;

                    var response = await Client.SendAsync(request).ConfigureAwait(false);
                    string body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                    if (!response.IsSuccessStatusCode)
                        throw new Exception($"{(int)response.StatusCode} {response.ReasonPhrase}: {body}");

                    var json = JObject.Parse(body);
                    string operationPath = json.Value<string>("path");

                    if (string.IsNullOrWhiteSpace(operationPath))
                        throw new Exception("Roblox did not return an operation path.");

                    Program.Emit("raw", $"Queued {Path.GetFileName(filePath)} with Roblox.");
                    return await PollOperationAsync(operationPath).ConfigureAwait(false);
                }
            }
            finally
            {
                UploadSlots.Release();
            }
        }

        private static Task WaitForRateSlotAsync()
        {
            int delayMs = 0;

            lock (RateLock)
            {
                var now = DateTime.UtcNow;

                if (nextUploadStart > now)
                    delayMs = (int)Math.Ceiling((nextUploadStart - now).TotalMilliseconds);

                nextUploadStart = (delayMs > 0 ? nextUploadStart : now).AddMilliseconds(UploadIntervalMs);
            }

            return delayMs > 0 ? Task.Delay(delayMs) : Task.CompletedTask;
        }

        private static async Task<string> PollOperationAsync(string operationPath)
        {
            string operationId = operationPath.Contains("/")
                ? operationPath.Substring(operationPath.LastIndexOf("/", StringComparison.Ordinal) + 1)
                : operationPath;

            for (int attempt = 0; attempt < 90; attempt++)
            {
                using (var request = new HttpRequestMessage(HttpMethod.Get, $"{OperationsUrl}/{operationId}"))
                {
                    request.Headers.Add("x-api-key", Program.RobloxApiKey);

                    var response = await Client.SendAsync(request).ConfigureAwait(false);
                    string body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                    if (!response.IsSuccessStatusCode)
                        throw new Exception($"{(int)response.StatusCode} {response.ReasonPhrase}: {body}");

                    var json = JObject.Parse(body);

                    if (json.Value<bool?>("done") != true)
                    {
                        await Task.Delay(1000).ConfigureAwait(false);
                        continue;
                    }

                    var error = json["error"];
                    if (error != null && error.Type != JTokenType.Null)
                        throw new Exception(error.Value<string>("message") ?? error.ToString(Formatting.None));

                    string assetId = json["response"]?.Value<string>("assetId");

                    if (string.IsNullOrWhiteSpace(assetId))
                        throw new Exception("Roblox completed the upload without an assetId.");

                    return assetId;
                }
            }

            throw new TimeoutException("Roblox asset upload did not finish within 90 seconds.");
        }

        private static void SetProperty(Instance target, string property, string value)
        {
            var prop = ResolveProperty(target, property);

            if (prop == null)
                throw new Exception($"Unknown property {property} in {target.ClassName}");

            SetPropertyValue(prop, value);
        }

        private static Property ResolveProperty(Instance target, string property)
        {
            var prop = target.GetProperty(property);

            if (prop != null)
                return prop;

            string alias = null;

            if (target is SurfaceAppearance)
            {
                switch (property)
                {
                    case "ColorMap":
                        alias = "ColorMapContent";
                        break;
                    case "NormalMap":
                        alias = "NormalMapContent";
                        break;
                    case "RoughnessMap":
                        alias = "RoughnessMapContent";
                        break;
                    case "MetalnessMap":
                        alias = "MetalnessMapContent";
                        break;
                }
            }
            else if (target is MeshPart && (property == "MeshId" || property == "MeshID"))
            {
                alias = "MeshContent";
            }

            return alias == null ? null : target.GetProperty(alias);
        }

        private static void SetPropertyValue(Property prop, string value)
        {
            object current = prop.Value;

            if (current is Content)
            {
                prop.Value = new Content(value);
                return;
            }

            if (current is ContentId)
            {
                prop.Value = new ContentId(value);
                return;
            }

            prop.Value = value;
        }

        private static void RequireUploadedAsset(string value, string localPath)
        {
            if (!value.StartsWith("rbxassetid://", StringComparison.OrdinalIgnoreCase))
                throw new Exception($"Upload did not produce a Roblox asset id for {localPath}.");
        }

        private string LocalAsset(string localPath)
        {
            return $"{localAssetRoot}/{localPath.Replace('\\', '/')}";
        }

        private static string NormalizeLocalPath(string localPath)
        {
            if (localPath.EndsWith(".vtf", StringComparison.OrdinalIgnoreCase))
                localPath = Path.ChangeExtension(localPath, ".png");

            return localPath.Replace('\\', '/');
        }

        private static string TrimName(string name)
        {
            if (string.IsNullOrWhiteSpace(name))
                return "source2roblox_asset";

            return name.Length > 50 ? name.Substring(0, 50) : name;
        }
    }
}
