using System;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;

namespace Source2Roblox.Util
{
    public class ConversionHistoryEntry
    {
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
        public string ConversionType { get; set; } = string.Empty;  // "map", "model", "texture", "advanced"
        public string GameDir { get; set; } = string.Empty;
        public string GameName { get; set; } = string.Empty;
        public string Target { get; set; } = string.Empty;           // map name, model path, or vtf path
        public bool UploadedTextures { get; set; } = false;
        public bool UploadedMeshes { get; set; } = false;
        public bool Succeeded { get; set; } = true;
        public string ErrorMessage { get; set; } = string.Empty;

        [JsonIgnore]
        public string DisplayTarget => string.IsNullOrEmpty(Target) ? "(unknown)" : Target;

        [JsonIgnore]
        public string DisplayType => ConversionType switch
        {
            "map"      => "Map",
            "model"    => "Model",
            "texture"  => "Texture",
            "advanced" => "Advanced",
            _          => ConversionType
        };

        [JsonIgnore]
        public string DisplayGame => string.IsNullOrEmpty(GameName) ? Path.GetFileName(GameDir) : GameName;

        [JsonIgnore]
        public string DisplayTimestamp => Timestamp.ToLocalTime().ToString("yyyy-MM-dd  HH:mm");

        [JsonIgnore]
        public string StatusBadge => Succeeded ? "✔" : "✘";
    }

    public static class ConversionHistoryManager
    {
        private static readonly string HistoryPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "OpenSource2Roblox",
            "history.json"
        );

        private const int MaxEntries = 200;

        public static List<ConversionHistoryEntry> Load()
        {
            try
            {
                if (File.Exists(HistoryPath))
                {
                    string json = File.ReadAllText(HistoryPath);
                    return JsonConvert.DeserializeObject<List<ConversionHistoryEntry>>(json)
                           ?? new List<ConversionHistoryEntry>();
                }
            }
            catch { }
            return new List<ConversionHistoryEntry>();
        }

        public static void Append(ConversionHistoryEntry entry)
        {
            try
            {
                var history = Load();
                history.Insert(0, entry);  // newest first

                if (history.Count > MaxEntries)
                    history = history.GetRange(0, MaxEntries);

                Save(history);
            }
            catch { }
        }

        public static void Clear()
        {
            try
            {
                if (File.Exists(HistoryPath))
                    File.Delete(HistoryPath);
            }
            catch { }
        }

        private static void Save(List<ConversionHistoryEntry> history)
        {
            string dir = Path.GetDirectoryName(HistoryPath);
            if (!Directory.Exists(dir))
                Directory.CreateDirectory(dir);

            string json = JsonConvert.SerializeObject(history, Formatting.Indented);
            File.WriteAllText(HistoryPath, json);
        }
    }
}
