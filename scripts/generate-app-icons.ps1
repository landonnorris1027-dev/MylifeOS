# Export the approved artwork without changing its design. Windows PowerShell 5.1+.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourcePath = Join-Path $projectRoot 'assets/branding/mylifeos-icon-v1.png'
$source = [Drawing.Image]::FromFile($sourcePath)
$background = [Drawing.ColorTranslator]::FromHtml('#f8fafd')

function New-IconBitmap([int]$size, [double]$artworkScale = 1) {
    $bitmap = [Drawing.Bitmap]::new($size, $size, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $attributes = [Drawing.Imaging.ImageAttributes]::new()
    try {
        $graphics.Clear($background)
        $graphics.CompositingQuality = [Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $attributes.SetWrapMode([Drawing.Drawing2D.WrapMode]::TileFlipXY)
        $edge = [int][Math]::Round($size * $artworkScale)
        $inset = [int][Math]::Floor(($size - $edge) / 2)
        $rectangle = [Drawing.Rectangle]::new($inset, $inset, $edge, $edge)
        $graphics.DrawImage($source, $rectangle, 0, 0, $source.Width, $source.Height, [Drawing.GraphicsUnit]::Pixel, $attributes)
    } finally {
        $attributes.Dispose()
        $graphics.Dispose()
    }
    return $bitmap
}

function Save-IconPng([string]$relativePath, [int]$size, [double]$artworkScale = 1) {
    $destination = Join-Path $projectRoot $relativePath
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
    $bitmap = New-IconBitmap $size $artworkScale
    try { $bitmap.Save($destination, [Drawing.Imaging.ImageFormat]::Png) }
    finally { $bitmap.Dispose() }
}

try {
    foreach ($size in @(32, 64, 180, 192, 512)) {
        Save-IconPng "public/assets/icons/app-$size.png" $size
    }
    # Extra margin keeps the complete mark inside the maskable safe circle.
    Save-IconPng 'public/assets/icons/app-maskable-512.png' 512 0.88
    Save-IconPng 'icon.png' 512

    $sizes = @(16, 24, 32, 48, 64, 128, 256)
    $frames = [Collections.Generic.List[byte[]]]::new()
    foreach ($size in $sizes) {
        $bitmap = New-IconBitmap $size
        $stream = [IO.MemoryStream]::new()
        try {
            $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
            $frames.Add($stream.ToArray())
        } finally {
            $stream.Dispose()
            $bitmap.Dispose()
        }
    }
    $iconPath = Join-Path $projectRoot 'assets/icon.ico'
    $iconStream = [IO.File]::Create($iconPath)
    $writer = [IO.BinaryWriter]::new($iconStream)
    try {
        $writer.Write([uint16]0)
        $writer.Write([uint16]1)
        $writer.Write([uint16]$sizes.Count)
        $offset = 6 + 16 * $sizes.Count
        for ($index = 0; $index -lt $sizes.Count; $index++) {
            $dimension = if ($sizes[$index] -eq 256) { 0 } else { $sizes[$index] }
            $writer.Write([byte]$dimension)
            $writer.Write([byte]$dimension)
            $writer.Write([byte]0)
            $writer.Write([byte]0)
            $writer.Write([uint16]1)
            $writer.Write([uint16]32)
            $writer.Write([uint32]$frames[$index].Length)
            $writer.Write([uint32]$offset)
            $offset += $frames[$index].Length
        }
        foreach ($frame in $frames) { $writer.Write([byte[]]$frame) }
    } finally { $writer.Dispose() }
    Copy-Item -LiteralPath $iconPath -Destination (Join-Path $projectRoot 'public/assets/icons/favicon.ico') -Force

    $densities = @(
        @{ Name = 'mdpi'; Launcher = 48; Foreground = 108 },
        @{ Name = 'hdpi'; Launcher = 72; Foreground = 162 },
        @{ Name = 'xhdpi'; Launcher = 96; Foreground = 216 },
        @{ Name = 'xxhdpi'; Launcher = 144; Foreground = 324 },
        @{ Name = 'xxxhdpi'; Launcher = 192; Foreground = 432 }
    )
    foreach ($density in $densities) {
        $folder = "android/app/src/main/res/mipmap-$($density.Name)"
        Save-IconPng "$folder/ic_launcher.png" $density.Launcher
        Save-IconPng "$folder/ic_launcher_round.png" $density.Launcher
        # Adaptive layers are 108 dp; retain the original 72 dp artwork area.
        Save-IconPng "$folder/ic_launcher_foreground.png" $density.Foreground (2.0 / 3.0)
    }
    Write-Output 'Exported Windows ICO, web icons, and Android launcher resources from the approved artwork.'
} finally { $source.Dispose() }
