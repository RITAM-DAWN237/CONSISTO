# Logo folder

Upload your logo here **manually** with this exact file name:

```
public/logo/logo1.png
```

CONSISTO automatically detects the file and shows it in the sidebar, the mobile top bar,
the sign-in screen and the loading screen. Until the file exists, a built-in vector
version of the CONSISTO mark is displayed instead, so the app never shows a broken image.

Supported names (checked in this order):

1. `logo1.png`  (recommended — square, transparent background, at least 512×512)
2. `logo1.svg`
3. `logo1.webp`
4. `logo1.jpg` / `logo1.jpeg`
5. `LOGO1.png` / `LOGO1.PNG` / `LOGO1.jpg`

Tips

- Use a **transparent background** so the logo blends with dark, light and AMOLED themes.
- Keep it **square**; it is displayed with rounded corners at 28–64 px.
- File names are case-sensitive on Netlify (Linux), so `logo1.png` and `Logo1.png` are different files.
- The installed PWA icon (home-screen icon) comes from `public/icons/`. To use your logo there too,
  export it as 192×192 and 512×512 PNGs and replace `icon-192.png`, `icon-512.png`,
  `maskable-192.png`, `maskable-512.png` and `apple-touch-icon.png` (180×180).
