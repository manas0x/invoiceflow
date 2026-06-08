/**
 * Simple service for Google Drive uploads using the REST API.
 * Requires a valid Google OAuth2 Access Token.
 */
export const googleDriveService = {
    async authenticate() {
        const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
        if (!CLIENT_ID || CLIENT_ID.includes('your-google-client-id')) {
            throw new Error("Google Client ID not configured in .env");
        }

        const scope = 'https://www.googleapis.com/auth/drive.file';
        const redirectUri = window.location.origin;
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${redirectUri}&response_type=token&scope=${scope}`;

        // Open in a popup
        const width = 500, height = 600;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;
        const popup = window.open(authUrl, 'google-auth', `width=${width},height=${height},left=${left},top=${top}`);

        if (!popup) throw new Error("Popup blocked by browser. Please allow popups for this site.");

        return new Promise((resolve, reject) => {
            const checkPopup = setInterval(() => {
                let isClosed = false;
                try {
                    isClosed = popup.closed;
                } catch (e) {
                    // Ignore COOP errors
                }

                if (isClosed) {
                    clearInterval(checkPopup);
                    reject(new Error("Login window closed by user."));
                    return;
                }

                try {
                    if (popup.location.href.includes('access_token')) {
                        const url = new URL(popup.location.href.replace('#', '?'));
                        const token = url.searchParams.get('access_token');
                        const expiresIn = url.searchParams.get('expires_in'); // in seconds

                        popup.close();
                        clearInterval(checkPopup);

                        if (token) {
                            resolve({
                                token,
                                expiry: Date.now() + (parseInt(expiresIn) * 1000)
                            });
                        } else {
                            reject(new Error("Failed to capture access token."));
                        }
                    }
                } catch (e) {
                    // Ignore Cross-Origin errors while the login is happening
                }
            }, 500);
        });
    },

    async uploadJSON(filename, data, accessToken, folderId = null) {
        if (!accessToken) throw new Error("Google Drive Access Token required");

        const metadata = {
            name: filename,
            mimeType: 'application/json',
            parents: folderId ? [folderId] : ['root']
        };

        const fileContent = JSON.stringify(data, null, 2);
        const fileBlob = new Blob([fileContent], { type: 'application/json' });

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', fileBlob);

        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            },
            body: form
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Google Drive Upload Failed: ${error.error?.message || response.statusText}`);
        }

        return await response.json();
    },

    async findOrCreateFolder(folderName, accessToken) {
        // 1. Search for existing folder
        const q = encodeURIComponent(`name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
        const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const searchData = await searchRes.json();

        if (searchData.files && searchData.files.length > 0) {
            return searchData.files[0].id;
        }

        // 2. Create if not found
        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder'
            })
        });
        const createData = await createRes.json();
        return createData.id;
    },

    async deleteOldBackups(folderId, accessToken, keepCount = 1) {
        if (!folderId) return;

        // List files in folder, sorted by modifiedTime descending
        const q = encodeURIComponent(`'${folderId}' in parents and mimeType = 'application/json' and trashed = false`);
        const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime%20desc&fields=files(id,name)`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const listData = await listRes.json();

        if (listData.files && listData.files.length > keepCount) {
            const toDelete = listData.files.slice(keepCount);
            console.log(`Google Drive: Deleting ${toDelete.length} old backups...`);

            for (const file of toDelete) {
                await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
            }
        }
    }
};
