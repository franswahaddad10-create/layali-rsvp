# Desktop App And Secure Remote Access

## Desktop Installer
- Installer path: `desktop/dist/Layali Setup 1.0.0.exe`
- Remote client installer path: `desktop/dist/Layali Remote Setup 1.0.0.exe`
- Portable unpacked build: `desktop/dist/win-unpacked/`

## What Was Prepared
- Electron desktop app wrapper was added under `desktop/`
- Full Windows installer build was created
- Tailscale was installed on this computer
- Tailscale login flow was initialized

## Complete Tailscale Login
1. Open the authentication link shown by the setup flow.
2. Sign in with your Tailscale account.
3. Approve this computer into your tailnet.
4. After approval, run:
   `"C:\Program Files\Tailscale\tailscale.exe" status`

## Recommended Usage Model
- Install and run the desktop app on this computer.
- Install the remote client app on another computer.
- The remote client connects directly to this computer over Tailscale using its private address.
- Use Tailscale to reach this computer securely from anywhere.
- Access can happen through the dedicated app-to-app connection without exposing the RSVP system on the public internet.

## Current Remote App Target
- Host machine Tailscale IPv4: `100.70.48.83`
- Secure host name: `https://desktop-g6nikgc.tail35eb9d.ts.net`
- The remote installer is preconfigured to call: `https://desktop-g6nikgc.tail35eb9d.ts.net/api`

## Important Note
This setup gives secure remote access to the computer.
It does not publish the RSVP system as a public cloud website.
If you want browser access without remote desktop, the next step should be a cloud deployment or a controlled private reverse proxy over Tailscale.
