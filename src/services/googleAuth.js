const { google } = require("googleapis");

async function googleAuth() {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN || "";

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      "urn:ietf:wg:oauth:2.0:oob"
    );

    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const { token } = await oauth2Client.getAccessToken();

    return {
      client_id: clientId,
      client_secret: clientSecret,
      access_token: token,
      refresh_token: refreshToken,
    };
  } catch (error) {
    throw new Error(`Error generando credenciales: ${error.message}`);
  }
}

module.exports = {
  googleAuth
};
