# Transfero

Transfer photos, videos, and other files from an iPhone to a Windows PC over your local Wi-Fi. Transfero streams each file directly to the PC; it does not use cloud storage.

## Requirements

- Windows 10 or later
- Node.js 20 or later
- iPhone and PC connected to the same Wi-Fi network

## Start the transfer server

1. In PowerShell, open this project folder.
2. Run `npm install` once, then `npm run build`.
3. Run `npm start` and leave that window open.
4. Open one of the `http://...` addresses printed in PowerShell on your iPhone.
5. Choose photos, videos, or other files. They are saved in `C:\photos\uploads`; Transfero creates the folder if it does not exist.

If Windows asks whether Node.js may communicate on the network, allow it on **Private networks**. If the page does not load, check that both devices are on the same Wi-Fi and that the Windows firewall allows Node.js on the private network.

You can change the port by setting `PORT` before starting the server. For example, in PowerShell: `$env:PORT=4322; npm start`.

## Network and privacy

The server listens on the local network so your iPhone can reach it. Anyone with access to that same network and address can send files to this PC, so use a trusted private network and stop the server when you are done. Uploaded files remain in `C:\photos\uploads` until you move or remove them.
