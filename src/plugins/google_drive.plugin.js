import { HardDrive } from 'lucide-react';
import { firestoreService } from '../services/firestoreService';
import { googleDriveService } from '../services/googleDriveService';

export const GoogleDrivePlugin = {
    id: 'google-drive',
    name: "Google Drive Backup",
    description: "Automatic JSON database backup to your Google Drive.",
    icon: HardDrive,
    defaultEnabled: true,
    settings: {
        backupFrequency: 7, // Days
        lastBackup: null,
        autoBackup: true,
        accessToken: '',
        tokenExpiry: null,
        backupEmail: '',
    },
    hooks: {
        init: async (settings, setSettings, context) => {
            // Auto-backup logic removed from init to prevent triggering on page refreshes.
            // It is now triggered manually from Login.jsx after Google Login.
        }
    },

    // Centralized backup logic
    performBackup: async (settings, setSettings) => {
        const accessToken = settings.accessToken;
        if (!accessToken) throw new Error("Google Drive Access Token required");

        try {
            console.log("Google Drive Backup: Starting backup...");

            // 1. Check token expiry (only for manually entered tokens)
            if (!settings.isFromSession && settings.tokenExpiry && Date.now() > settings.tokenExpiry) {
                throw new Error("Token expired. Please reconnect Google Drive.");
            }

            // 2. Export Data
            console.log("Google Drive Backup: Exporting data from Firestore...");
            const data = await firestoreService.exportAllDataJSON();
            const timestamp = new Date().toISOString();
            const fileName = `Invoice Flow_Backup_${timestamp.split('T')[0]}.json`;

            // 3. Find or Create Folder
            console.log("Google Drive Backup: Accessing Google Drive to find/create folder...");
            const folderId = await googleDriveService.findOrCreateFolder("Invoice Flow_Backups", accessToken);

            // 4. Upload to Folder
            console.log("Google Drive Backup: Uploading JSON to Google Drive...");
            await googleDriveService.uploadJSON(fileName, data, accessToken, folderId);

            // 5. Cleanup Old Backups (Keep only latest)
            console.log("Google Drive Backup: Cleaning up old backups...");
            await googleDriveService.deleteOldBackups(folderId, accessToken, 1);

            // 6. Update last backup date
            setSettings({ ...settings, lastBackup: timestamp });

            // 7. Persist to Firestore
            console.log("Google Drive Backup: Persisting metadata to Firestore...");
            await firestoreService.updateAppSettings('google_drive_backup', {
                lastBackup: timestamp,
                success: true
            });

            console.log("Google Drive Backup: Success!");
            return true;
        } catch (e) {
            console.error("Google Drive Backup Error:", e);
            // Clear token if it seems invalid and it was manual
            if (!settings.isFromSession && (e.message.toLowerCase().includes('unauthorized') || e.message.toLowerCase().includes('expired') || e.message.toLowerCase().includes('token'))) {
                setSettings({ ...settings, accessToken: '', tokenExpiry: null });
            }
            throw e;
        }
    }
};
