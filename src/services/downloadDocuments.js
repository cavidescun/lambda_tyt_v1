const { google } = require("googleapis");
const fs = require("fs-extra");
const path = require("path");

const { createTempDirectory } = require("../utils/tempStorage");
const { googleAuth } = require("./googleAuth");

async function downloadDocuments(urls) {
  const tempDir = await createTempDirectory();
  const downloadedFiles = [];

  const googleCredentials = await googleAuth();

  for (const url of urls) {
    const fileId = extractFileIdFromUrl(url);

    const oauth2Client = new google.auth.OAuth2(
      googleCredentials.client_id,
      googleCredentials.client_secret
    );
    if (googleCredentials.access_token) {
      oauth2Client.setCredentials({
        access_token: googleCredentials.access_token,
        refresh_token: googleCredentials.refresh_token,
      });

      const filePath = await downloadFileFromDrive(fileId, tempDir, oauth2Client);

      const stats = await fs.stat(filePath);
      
      downloadedFiles.push({
        originalUrl: url,
        fileId,
        path: filePath,
        fileName: path.basename(filePath),
        size: stats.size
      });
    } else {
      console.log(`[DRIVE] No hay access_token en las credenciales`);
    }
  }

  return downloadedFiles;
}

async function downloadFileFromDrive(fileId, tempDir, oauth2Client) {
  try {
    const drive = google.drive({ version: "v3", auth: oauth2Client });
    const fileMetadata = await drive.files.get({
      fileId: fileId,
      fields: "name,mimeType,size",
    });

    const fileName = fileMetadata.data.name || `${fileId}.pdf`;
    const filePath = path.join(tempDir, fileName);
    const response = await drive.files.get(
      {
        fileId: fileId,
        alt: "media",
      },
      { responseType: "stream" }
    );

    const writer = fs.createWriteStream(filePath);
    return new Promise((resolve, reject) => {
      response.data.on("error", reject);
      writer.on("error", reject);
      writer.on("finish", () => {
        resolve(filePath);
      });
      response.data.pipe(writer);
    });
  } catch (error) {
    console.error(`[DRIVE-AUTH] Error descargando ${fileId}:`, error.message);

    if (error.code === 403) {
      throw new Error(
        `PERMISSION_DENIED: No tienes permisos para acceder al archivo ${fileId}`
      );
    }

    if (error.code === 404) {
      throw new Error(
        `FILE_NOT_FOUND: El archivo ${fileId} no existe o no es accesible`
      );
    }

    throw new Error(`AUTH_DOWNLOAD_ERROR: ${error.message}`);
  }
}

function extractFileIdFromUrl(url) {
  const regexPatterns = [/\/file\/d\/([^/]+)/, /id=([^&]+)/, /\/d\/([^/]+)/];

  for (const regex of regexPatterns) {
    const match = url.match(regex);
    if (match && match[1]) {
      return match[1];
    }
  }

  throw new Error(`No se pudo extraer el File ID de la URL: ${url}`);
}

module.exports = {
  downloadDocuments
};