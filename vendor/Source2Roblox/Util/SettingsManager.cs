using System;
using System.IO;
using Newtonsoft.Json;

namespace Source2Roblox.Util
{
    public class AppSettings
    {
        public string CustomTexturesDir { get; set; } = string.Empty;
        public string GameDir { get; set; } = string.Empty;
        public string SelectedGameId { get; set; } = string.Empty;
        public string LanguageOverride { get; set; } = "";
        public string Theme { get; set; } = "Light";
        public string Backdrop { get; set; } = "Mica";
        public bool UploadAssets { get; set; } = false;
        public bool UploadMeshes { get; set; } = false;
        public string RobloxApiKey { get; set; } = string.Empty;
        public string RobloxCreatorType { get; set; } = "User";
        public string RobloxCreatorId { get; set; } = string.Empty;
    }

    public static class SettingsManager
    {
        private static readonly string SettingsPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "OpenSource2Roblox",
            "settings.json"
        );

        public static AppSettings Load()
        {
            try
            {
                if (File.Exists(SettingsPath))
                {
                    string json = File.ReadAllText(SettingsPath);
                    var settings = JsonConvert.DeserializeObject<AppSettings>(json);
                    if (settings != null)
                        return settings;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error loading settings: {ex.Message}");
            }

            return new AppSettings();
        }

        public static void Save(AppSettings settings)
        {
            try
            {
                string dir = Path.GetDirectoryName(SettingsPath);
                if (!Directory.Exists(dir))
                    Directory.CreateDirectory(dir);

                string json = JsonConvert.SerializeObject(settings, Formatting.Indented);
                File.WriteAllText(SettingsPath, json);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error saving settings: {ex.Message}");
            }
        }
    }
}
