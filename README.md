# OpenSource2Roblox

OpenSource2Roblox is a tool for converting Source 1 assets to a Roblox-readable format (e.g., `.rblx`, `.rbxm`, `.mesh`). This project implements a new frontend, a cache system to speed up conversion tasks, and a handful of Quality-of-Life (QoL) improvements.

## Supported Games

The following games have been tested and proven to convert perfectly:

* **Counter-Strike: Global Offensive (Build 1.38.8.1)** *(de_dust2 and de_ancient tested)*
  * *Note:* Certain CS:GO maps tend to import with simplified and generally very poorly converted terrain geometry; however, most should convert fine.
* **Garry's Mod** *(x86-64 branch; gm_construct and gm_flatgrass tested)*

---

## Build Instructions

> **Note:** You do not need to build this yourself! Pre-published executables are available in the **Releases** tab. Only follow these steps if you have made modifications or prefer to compile from source.

### Prerequisites
* [Git](https://git-scm.com/downloads) installed on your system.
* [.NET 8.0 SDK](https://dotnet.microsoft.com/download/dotnet/8.0) (or newer) installed on Windows.

### Steps to Clone and Build

1. **Clone the Repository:**
   Open your terminal (Command Prompt, PowerShell, or Git Bash) and run the following commands to clone the repository and navigate into the project folder:
   ```bash
   git clone https://github.com/mustafaalios/OpenSource2Roblox.git

2. **Move into the Repository:**
   ```bash
   cd OpenSource2Roblox

3. **Build in release mode:**
  ```bash
   dotnet build vendor/Source2Roblox/Source2Roblox.csproj --configuration Release

4. **Publish as executable:**
  ```bash
   dotnet publish vendor/Source2Roblox/Source2Roblox.csproj --configuration Release --runtime win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true --output release
   
