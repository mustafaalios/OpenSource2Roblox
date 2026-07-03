using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Forms;
using Source2Roblox.Util;

namespace Source2Roblox.Views
{
    public partial class HomeView : Page
    {
        private string activeMode = "map";
        private List<GameInfo> discoveredGames = new List<GameInfo>();
        private GameInfo? selectedGame;
        private string previewPlacePath = string.Empty;

        public HomeView()
        {
            InitializeComponent();
            
            // Subscribe to console emits
            Program.OnEmit += Program_OnEmit;

            // Load mode default
            SetActiveMode(activeMode);

            // Load games
            RefreshGames();
        }

        private void RefreshGames()
        {
            discoveredGames = SteamScanner.ScanSourceGames();
            GamesComboBox.Items.Clear();
            foreach (var game in discoveredGames)
            {
                GamesComboBox.Items.Add(game.Name);
            }
        }

        private void SetActiveMode(string mode)
        {
            activeMode = mode;
            
            // Update button styles
            ModeMapButton.Appearance = mode == "map" ? Wpf.Ui.Controls.ControlAppearance.Primary : Wpf.Ui.Controls.ControlAppearance.Secondary;
            ModeModelButton.Appearance = mode == "model" ? Wpf.Ui.Controls.ControlAppearance.Primary : Wpf.Ui.Controls.ControlAppearance.Secondary;
            ModeTextureButton.Appearance = mode == "texture" ? Wpf.Ui.Controls.ControlAppearance.Primary : Wpf.Ui.Controls.ControlAppearance.Secondary;
            ModeAdvancedButton.Appearance = mode == "advanced" ? Wpf.Ui.Controls.ControlAppearance.Primary : Wpf.Ui.Controls.ControlAppearance.Secondary;

            // Show/hide cards
            MapCard.Visibility = (mode == "map" || mode == "advanced") ? Visibility.Visible : Visibility.Collapsed;
            ModelCard.Visibility = (mode == "model" || mode == "advanced") ? Visibility.Visible : Visibility.Collapsed;
            TextureCard.Visibility = (mode == "texture" || mode == "advanced") ? Visibility.Visible : Visibility.Collapsed;
        }

        private void ModeButton_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Wpf.Ui.Controls.Button btn)
            {
                SetActiveMode(btn.Tag as string ?? "map");
            }
        }

        private void GamesComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            int idx = GamesComboBox.SelectedIndex;
            if (idx >= 0 && idx < discoveredGames.Count)
            {
                selectedGame = discoveredGames[idx];
                GameDirTextBox.Text = selectedGame.GameDir;
                
                // Populate maps dropdown
                MapsComboBox.Items.Clear();
                foreach (var map in selectedGame.Maps)
                {
                    MapsComboBox.Items.Add(map);
                }
            }
        }

        private void GameDirTextBox_TextChanged(object sender, TextChangedEventArgs e)
        {
            string path = GameDirTextBox.Text.Trim();
            if (Directory.Exists(path) && File.Exists(Path.Combine(path, "gameinfo.txt")))
            {
                // Scan maps locally
                MapsComboBox.Items.Clear();
                string mapsDir = Path.Combine(path, "maps");
                if (Directory.Exists(mapsDir))
                {
                    try
                    {
                        foreach (string file in Directory.GetFiles(mapsDir, "*.bsp"))
                        {
                            MapsComboBox.Items.Add(Path.GetFileNameWithoutExtension(file));
                        }
                    }
                    catch { }
                }
            }
        }

        private void BrowseGameButton_Click(object sender, RoutedEventArgs e)
        {
            using (var dialog = new FolderBrowserDialog())
            {
                dialog.Description = "Select Source Game Mount Directory";
                dialog.UseDescriptionForTitle = true;
                if (dialog.ShowDialog() == DialogResult.OK)
                {
                    GameDirTextBox.Text = dialog.SelectedPath;
                }
            }
        }

        private void BrowseTextureButton_Click(object sender, RoutedEventArgs e)
        {
            using (var dialog = new OpenFileDialog())
            {
                dialog.Filter = "Valve Texture Files (*.vtf)|*.vtf";
                dialog.Title = "Select VTF Texture File";
                if (dialog.ShowDialog() == DialogResult.OK)
                {
                    TextureTextBox.Text = dialog.FileName;
                }
            }
        }

        private void Program_OnEmit(string type, string message, object data)
        {
            Dispatcher.Invoke(() =>
            {
                LogTextBox.AppendText($"[{type.ToUpper()}] {message}\r\n");
                LogTextBox.ScrollToEnd();

                if (type == "progress")
                {
                    ProgressStatusText.Text = message;
                }
                else if (type == "output")
                {
                    if (data != null)
                    {
                        try
                        {
                            var typeOfData = data.GetType();
                            var pathProp = typeOfData.GetProperty("path");
                            if (pathProp != null)
                            {
                                string val = pathProp.GetValue(data)?.ToString() ?? string.Empty;
                                if (!string.IsNullOrEmpty(val))
                                {
                                    if (val.EndsWith("maps") || val.Contains("maps"))
                                    {
                                        string bspName = MapsComboBox.Text.Trim();
                                        string parent = Path.GetDirectoryName(val);
                                        string rbxlPath = Path.Combine(parent, $"{bspName}.rbxl");
                                        if (File.Exists(rbxlPath))
                                        {
                                            previewPlacePath = rbxlPath;
                                            PreviewCard.Visibility = Visibility.Visible;
                                        }
                                    }
                                }
                            }
                        }
                        catch { }
                    }
                }
            });
        }

        private async void RunButton_Click(object sender, RoutedEventArgs e)
        {
            string gameDir = GameDirTextBox.Text.Trim();
            if (string.IsNullOrEmpty(gameDir) || !Directory.Exists(gameDir))
            {
                System.Windows.MessageBox.Show("Please select a valid game directory first.", "Warning", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            var settings = SettingsManager.Load();
            settings.GameDir = gameDir;
            SettingsManager.Save(settings);

            var args = new List<string>();
            args.Add("-game");
            args.Add(gameDir);

            if (!string.IsNullOrEmpty(settings.CustomTexturesDir))
            {
                args.Add("-customTexturesDir");
                args.Add(settings.CustomTexturesDir);
            }

            if (settings.UploadAssets)
            {
                args.Add("-upload");
                args.Add("true");
            }

            if (settings.UploadMeshes)
            {
                args.Add("-uploadMeshes");
                args.Add("true");
            }

            if (!string.IsNullOrEmpty(settings.RobloxApiKey))
            {
                args.Add("-robloxApiKey");
                args.Add(settings.RobloxApiKey);
            }

            if (!string.IsNullOrEmpty(settings.RobloxCreatorType))
            {
                args.Add("-robloxCreatorType");
                args.Add(settings.RobloxCreatorType.ToLowerInvariant());
            }

            if (!string.IsNullOrEmpty(settings.RobloxCreatorId))
            {
                args.Add("-robloxCreatorId");
                args.Add(settings.RobloxCreatorId);
            }

            if (activeMode == "map")
            {
                string map = MapsComboBox.Text.Trim();
                if (string.IsNullOrEmpty(map))
                {
                    System.Windows.MessageBox.Show("Please enter or select a map name.", "Warning", MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }
                args.Add("-map");
                args.Add(map);
            }
            else if (activeMode == "model")
            {
                string model = ModelTextBox.Text.Trim();
                if (string.IsNullOrEmpty(model))
                {
                    System.Windows.MessageBox.Show("Please enter a model name/path.", "Warning", MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }
                args.Add("-model");
                args.Add(model);
            }
            else if (activeMode == "texture")
            {
                string tex = TextureTextBox.Text.Trim();
                if (string.IsNullOrEmpty(tex))
                {
                    System.Windows.MessageBox.Show("Please enter or browse a VTF texture path.", "Warning", MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }
                args.Add("-vtf");
                args.Add(tex);
            }
            else if (activeMode == "advanced")
            {
                string map = MapsComboBox.Text.Trim();
                string model = ModelTextBox.Text.Trim();
                string tex = TextureTextBox.Text.Trim();

                if (!string.IsNullOrEmpty(map)) { args.Add("-map"); args.Add(map); }
                if (!string.IsNullOrEmpty(model)) { args.Add("-model"); args.Add(model); }
                if (!string.IsNullOrEmpty(tex)) { args.Add("-vtf"); args.Add(tex); }
            }

            RunButton.IsEnabled = false;
            ProgressPanel.Visibility = Visibility.Visible;
            LogTextBox.Clear();
            PreviewCard.Visibility = Visibility.Collapsed;
            LauncherErrorText.Visibility = Visibility.Collapsed;

            await Task.Run(() =>
            {
                try
                {
                    Program.Main(args.ToArray());
                }
                catch (Exception ex)
                {
                    Program.Emit("error", $"Fatal error: {ex.Message}", ex.ToString());
                }
            });

            RunButton.IsEnabled = true;
            ProgressPanel.Visibility = Visibility.Collapsed;
        }

        private void OpenPreviewButton_Click(object sender, RoutedEventArgs e)
        {
            LauncherErrorText.Visibility = Visibility.Collapsed;
            if (File.Exists(previewPlacePath))
            {
                try
                {
                    StudioLauncher.OpenInStudio(previewPlacePath);
                }
                catch (Exception ex)
                {
                    LauncherErrorText.Text = $"Failed to open Roblox Studio: {ex.Message}";
                    LauncherErrorText.Visibility = Visibility.Visible;
                }
            }
        }

        public void UpdateLanguage()
        {
            ConversionModeLabel.Text     = LanguageManager.Get("Label_Mode");
            ModeMapButton.Content        = "Map";
            ModeModelButton.Content      = "Model";
            ModeTextureButton.Content    = "Texture";
            ModeAdvancedButton.Content   = "Advanced";

            GameMountLabel.Text          = LanguageManager.Get("Label_Mount");
            SteamSelectLabel.Text        = LanguageManager.Get("Label_SteamSelect");
            ManualSelectLabel.Text       = LanguageManager.Get("Label_ManualSelect");
            BrowseGameButton.Content     = LanguageManager.Get("Button_Browse");

            MapDetailsLabel.Text         = LanguageManager.Get("Label_MapDetails");
            MapDescLabel.Text            = LanguageManager.Get("Label_MapDesc");

            ModelDetailsLabel.Text       = LanguageManager.Get("Label_ModelDetails");
            ModelDescLabel.Text          = LanguageManager.Get("Label_ModelDesc");

            TextureDetailsLabel.Text     = LanguageManager.Get("Label_TextureDetails");
            TextureDescLabel.Text        = LanguageManager.Get("Label_TextureDesc");
            BrowseTextureButton.Content  = LanguageManager.Get("Button_Browse");

            RunButton.Content            = LanguageManager.Get("Button_Convert");

            PreviewTitleLabel.Text       = LanguageManager.Get("Label_PreviewTitle");
            PreviewDescLabel.Text        = LanguageManager.Get("Label_PreviewDesc");
            OpenPreviewButton.Content    = LanguageManager.Get("Button_OpenPreview");

            OutputTitleLabel.Text        = LanguageManager.Get("Label_OutputTitle");
        }
    }
}
