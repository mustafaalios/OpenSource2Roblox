using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Source2Roblox.FileSystem;
using Source2Roblox.Geometry;
using Source2Roblox.Models;
using Source2Roblox.Textures;
using Source2Roblox.World;

namespace Source2Roblox
{
    class Program
    {
        private static readonly Dictionary<string, string> argMap = new Dictionary<string, string>();
        public static GameMount GameMount { get; private set; }

        public const int STUDS_TO_VMF = 12;
        public static bool LOCAL_ONLY = true;
        public static bool NO_PROMPT = false;
        public static bool UploadAssets = false;
        public static bool UploadMeshes = false;
        public static string RobloxApiKey = "";
        public static string RobloxCreatorType = "user";
        public static string RobloxCreatorId = "";

        public static bool HasRobloxUploadCredentials =>
            !string.IsNullOrWhiteSpace(RobloxApiKey) &&
            !string.IsNullOrWhiteSpace(RobloxCreatorId) &&
            (RobloxCreatorType == "user" || RobloxCreatorType == "group");
        
        public static string GetArg(string argName)
        {
            if (argMap.TryGetValue(argName, out string arg))
                return arg;

            return null;
        }

        public static string CleanPath(string path)
        {
            string cleaned = path
                .ToLowerInvariant()
                .Replace('\\', '/')
                .Replace("//", "/");

            return cleaned;
        }

        public static void LogError(string log)
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine(log);
            Console.ForegroundColor = ConsoleColor.Gray;
        }

        public static void Emit(string type, string message, object data = null)
        {
            var payload = new
            {
                type,
                message,
                data,
                timestamp = DateTimeOffset.UtcNow.ToString("o")
            };

            Console.WriteLine("S2R_EVENT " + JsonConvert.SerializeObject(payload));
        }

        private static string GetDefaultOutputRoot()
        {
            string localAppData = Environment.GetEnvironmentVariable("localappdata");

            if (!string.IsNullOrEmpty(localAppData))
                return Path.Combine(localAppData, "Roblox Studio", "content", "source");

            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Desktop), "Source2Roblox");
        }

        private static string RequireGameInfo(string gameDir)
        {
            if (string.IsNullOrWhiteSpace(gameDir))
                throw new ArgumentException("Missing required -game path.");

            string gameInfo = gameDir.EndsWith("gameinfo.txt", StringComparison.OrdinalIgnoreCase)
                ? gameDir
                : Path.Combine(gameDir, "gameinfo.txt");

            if (!File.Exists(gameInfo))
                throw new FileNotFoundException("The selected game folder does not contain gameinfo.txt.", gameInfo);

            return gameDir;
        }

        private static string ReadJobArgs(string[] args)
        {
            string jobPath = null;

            for (int i = 0; i < args.Length - 1; i++)
            {
                if (args[i] == "-job")
                {
                    jobPath = args[i + 1];
                    break;
                }
            }

            if (string.IsNullOrWhiteSpace(jobPath))
                return null;

            if (!File.Exists(jobPath))
                throw new FileNotFoundException("Job file was not found.", jobPath);

            var job = JsonConvert.DeserializeObject<Dictionary<string, string>>(File.ReadAllText(jobPath));
            var expanded = new List<string>();

            foreach (var pair in job)
            {
                if (string.IsNullOrWhiteSpace(pair.Value))
                    continue;

                expanded.Add("-" + pair.Key.TrimStart('-'));
                expanded.Add(pair.Value);
            }

            return string.Join("\n", expanded);
        }

        [STAThread]
        static int Main(string[] args)
        {
            try
            {
                string jobArgs = ReadJobArgs(args);

                if (jobArgs != null)
                    args = jobArgs.Split(new[] { '\n' }, StringSplitOptions.RemoveEmptyEntries);
            }
            catch (Exception e)
            {
                Emit("error", e.Message, new { detail = e.ToString() });
                return 1;
            }

            #region Process Launch Options
            string argKey = "";

            foreach (string arg in args)
            {
                if (arg.StartsWith("-"))
                {
                    if (!string.IsNullOrEmpty(argKey))
                        argMap.Add(argKey, "");

                    argKey = arg;
                }
                else if (!string.IsNullOrEmpty(argKey))
                {
                    argMap.Add(argKey, arg);
                    argKey = "";
                }
            }

            if (!string.IsNullOrEmpty(argKey))
                argMap.Add(argKey, "");
            #endregion

            string noPrompt = GetArg("-noPrompt");
            string upload   = GetArg("-upload");
            string uploadMeshes = GetArg("-uploadMeshes");

            string gameDir = GetArg("-game");
            string model = GetArg("-model");
            string mesh = GetArg("-mesh");

            string mapName = GetArg("-map");
            string vtfName = GetArg("-vtf");
            string outputRoot = GetArg("-output");
            RobloxApiKey = GetArg("-robloxApiKey") ?? Environment.GetEnvironmentVariable("S2R_ROBLOX_API_KEY") ?? "";
            RobloxCreatorType = (GetArg("-robloxCreatorType") ?? "user").ToLowerInvariant();
            RobloxCreatorId = GetArg("-robloxCreatorId") ?? "";

            bool hasGame = !string.IsNullOrWhiteSpace(gameDir);
            bool vtfNeedsGame = vtfName != null && !Path.IsPathRooted(vtfName);

            if (!hasGame && (mapName != null || model != null || vtfNeedsGame))
            {
                Emit("error", "A Source game folder is required for maps, models, and relative VTF paths. Use an absolute VTF file path for texture-only export.");
                return 1;
            }

            if (upload != null)
            {
                LOCAL_ONLY = false;
                UploadAssets = true;
            }

            if (uploadMeshes != null)
                UploadMeshes = true;

            if (noPrompt != null)
                NO_PROMPT = true;

            try
            {
                outputRoot = string.IsNullOrWhiteSpace(outputRoot) ? GetDefaultOutputRoot() : outputRoot;
                Directory.CreateDirectory(outputRoot);

                if (hasGame)
                    gameDir = RequireGameInfo(gameDir);

                Emit("start", "Starting Source2Roblox conversion.", new
                {
                    game = gameDir,
                    output = outputRoot,
                    map = mapName,
                    model = model,
                    vtf = vtfName
                });

                if (hasGame)
                    GameMount = new GameMount(gameDir);
            }
            catch (Exception e)
            {
                Emit("error", e.Message, new { detail = e.ToString() });
                return 1;
            }

            if (mesh != null)
            {
                var load = RobloxMeshFile.Open(mesh);
                
                using (var stream = File.OpenWrite(mesh + "_PATCH"))
                    load.Save(stream);

                var reopen = RobloxMeshFile.Open(mesh + "_PATCH");
                
                var oldBones = load.Bones
                    .Select(bone => bone.CFrame.ToString())
                    .ToList();

                var newBones = reopen.Bones
                    .Select(bone => bone.CFrame.ToString())
                    .ToList();

                Debugger.Break();
            }

            if (vtfName != null)
            {
                var info = new FileInfo(vtfName);
                string name = info.Name.Replace(".vtf", "");

                string dir = Path.Combine(outputRoot, "ExamineVTF", name);
                Directory.CreateDirectory(dir);

                Emit("progress", $"Exporting VTF {vtfName}.", new { output = dir });

                using (var stream = Path.IsPathRooted(vtfName) ? File.OpenRead(vtfName) : GameMount.OpenRead(vtfName))
                using (var reader = new BinaryReader(stream))
                {
                    var file = new VTFFile(reader, true);

                    for (int i = 0; i < file.NumFrames; i++)
                    {
                        var frame = file.Frames[i];

                        for (int j = 0; j < frame.Count; j++)
                        {
                            var mipmap = frame[j];

                            for (int k = 0; k < mipmap.Count; k++)
                            {
                                var image = mipmap[k];
                                string savePath = Path.Combine(dir, $"{name}_{i}_{j}_{k}.png");
                                image.Save(savePath);
                            }
                        }
                    }

                    var lowRes = file.LowResImage;
                    var highRes = file.HighResImage;

                    if (lowRes != null)
                    {
                        string lowResPath = Path.Combine(dir, $"{name}_LOW_RES.png");
                        lowRes.Save(lowResPath);
                    }

                    var normalMap = SSBump.ToNormalMap(highRes);
                    string normalPath = Path.Combine(dir, $"{name}_NORMAL_MAP.png");

                    normalMap.Save(normalPath);
                }

                Emit("output", "VTF export complete.", new { path = dir });
            }

            if (model != null)
            {
                string exportDir = Path.Combine(outputRoot, "SourceModels");
                string robloxOutputDir = Path.Combine(outputRoot, GameMount.GameName);
                Directory.CreateDirectory(exportDir);

                if (string.IsNullOrWhiteSpace(model))
                {
                    Emit("error", "Interactive model search is not supported by the app wrapper. Enter a model path or name.");
                    return 1;
                }

                try
                {
                    Emit("progress", $"Processing model {model}.", new { output = exportDir });
                    var mdl = new ModelFile(model);
                    MeshBuilder.BakeMDL_RBXM(mdl, 0, outputRoot);
                    MeshBuilder.BakeMDL_OBJ(mdl, exportDir);
                    Emit("output", "Model export complete.", new { path = robloxOutputDir, objPath = exportDir });
                }
                catch (Exception e)
                {
                    Emit("error", e.Message, new { detail = e.ToString() });
                    return 1;
                }
            }

            if (mapName != null)
            {
                string exportDir = Path.Combine(outputRoot, GameMount.GameName, "maps");
                Directory.CreateDirectory(exportDir);

                try
                {
                    Emit("progress", $"Processing map {mapName}.", new { output = exportDir });
                    var bsp = new BSPFile($"maps/{mapName}.bsp");
                    MeshBuilder.BakeBSP_RBXL(bsp, null, outputRoot);
                    Emit("output", "Map export complete.", new { path = exportDir });
                }
                catch (Exception e)
                {
                    Emit("error", e.Message, new { detail = e.ToString() });
                    return 1;
                }
            }

            Emit("done", "Conversion finished.");
            return 0;
        }
    }
}
