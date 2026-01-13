"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase";
import { Upload, File, Trash2, Download, LogOut, Loader2, X, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import CryptoJS from "crypto-js";
import AdminPanel from "./admin-panel";

// Types
interface FileObject {
    name: string;
    id: string | null;
    updated_at: string;
    created_at: string;
    last_accessed_at: string;
    metadata: Record<string, any>;
}

export default function DashboardView() {
    const { user, signOut } = useAuth();
    const [files, setFiles] = useState<FileObject[]>([]);
    const [uploading, setUploading] = useState(false);
    const [loadingFiles, setLoadingFiles] = useState(true);
    const [dragActive, setDragActive] = useState(false);
    const [toast, setToast] = useState<{ type: 'success' | 'error', message: string } | null>(null);
    const [userProfile, setUserProfile] = useState<{ role: string, status: string } | null>(null);
    const [loadingProfile, setLoadingProfile] = useState(true);

    // Use a unique key for encryption per user (In a real app, this should be managed more securely, e.g., user input or KMS)
    const ENCRYPTION_KEY = user?.id || 'default-secret-key';
    const bucketName = 'emergency-tools';

    // Toast helper
    const showToast = (type: 'success' | 'error', message: string) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 3000);
    };

    // Fetch Profile
    const fetchProfile = useCallback(async () => {
        if (!user) return;
        setLoadingProfile(true);
        try {
            const { data, error } = await supabase.from('profiles').select('role, status').eq('id', user.id).single();

            if (error) {
                console.error("Error fetching profile:", error);
            } else {
                setUserProfile(data);
                if (data.status === 'approved') {
                    showToast('success', "Profile Approved! Welcome.");
                }
            }
        } catch (error) {
            console.error("Error fetching profile", error);
        } finally {
            setLoadingProfile(false);
        }
    }, [user]);

    useEffect(() => {
        fetchProfile();
    }, [fetchProfile]);

    // Logging Helper
    const logAction = async (action: string, fileName: string, details: string = "") => {
        if (!user) return;
        try {
            await supabase.from('access_logs').insert({
                user_id: user.id,
                action,
                file_name: fileName,
                details
            });
        } catch (error) {
            console.error("Logging failed:", error);
        }
    };

    // Fetch files
    const fetchFiles = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .storage
                .from(bucketName)
                .list(user?.id + '/', {
                    limit: 100,
                    offset: 0,
                    sortBy: { column: 'name', order: 'asc' },
                });

            if (error) throw error;
            setFiles(data || []);
        } catch (error: any) {
            console.error('Error fetching files:', error.message);
        } finally {
            setLoadingFiles(false);
        }
    }, [user]);

    useEffect(() => {
        if (user && userProfile?.status === 'approved') fetchFiles();
    }, [user, userProfile, fetchFiles]);

    // Encryption Helper (Same as before)
    const encryptFile = (file: File): Promise<Blob> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const wordArray = CryptoJS.lib.WordArray.create(reader.result as any);
                const encrypted = CryptoJS.AES.encrypt(wordArray, ENCRYPTION_KEY).toString();
                resolve(new Blob([encrypted], { type: 'text/plain' }));
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    };

    const decryptFile = async (blob: Blob): Promise<Blob> => {
        const text = await blob.text();
        const decrypted = CryptoJS.AES.decrypt(text, ENCRYPTION_KEY);
        const typedArray = convertWordArrayToUint8Array(decrypted);
        return new Blob([typedArray]);
    };

    const convertWordArrayToUint8Array = (wordArray: CryptoJS.lib.WordArray) => {
        const len = wordArray.sigBytes;
        const u8 = new Uint8Array(len);
        let offset = 0;
        for (let i = 0; i < wordArray.words.length; i++) {
            const word = wordArray.words[i];
            const byte1 = (word >> 24) & 0xff;
            const byte2 = (word >> 16) & 0xff;
            const byte3 = (word >> 8) & 0xff;
            const byte4 = word & 0xff;
            if (offset < len) u8[offset++] = byte1;
            if (offset < len) u8[offset++] = byte2;
            if (offset < len) u8[offset++] = byte3;
            if (offset < len) u8[offset++] = byte4;
        }
        return u8;
    };


    // Upload Logic
    const handleFileUpload = async (file: File) => {
        if (!user) return;
        setUploading(true);

        try {
            // Encrypt before upload
            const encryptedBlob = await encryptFile(file);
            const filePath = `${user.id}/${file.name}`; // Keep original name, content is encrypted

            const { error } = await supabase.storage.from(bucketName).upload(filePath, encryptedBlob, {
                upsert: true,
                contentType: 'application/encrypted', // Mark as encrypted
                metadata: { originalType: file.type, encrypted: 'true' }
            });

            if (error) throw error;

            await logAction("UPLOAD", file.name, `Size: ${file.size} bytes`);
            showToast('success', `Encrypted & Uploaded ${file.name}`);
            fetchFiles();
        } catch (error: any) {
            showToast('error', error.message);
        } finally {
            setUploading(false);
        }
    };

    // Drag and Drop handlers
    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    };

    // Actions
    const handleDownload = async (fileName: string, originalType: string = 'application/octet-stream') => {
        try {
            const { data, error } = await supabase.storage
                .from(bucketName)
                .download(`${user?.id}/${fileName}`);

            if (error) throw error;

            let finalBlob = data;
            try {
                finalBlob = await decryptFile(data);
                showToast('success', 'File Decrypted Successfully');
            } catch (e) {
                console.warn("Decryption failed", e);
            }

            const url = window.URL.createObjectURL(new Blob([finalBlob], { type: originalType }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            link.remove();

            await logAction("DOWNLOAD", fileName);

        } catch (error: any) {
            console.error("Download Error", error);
            showToast('error', error.message || "Download failed");
        }
    };

    const handleDelete = async (fileName: string) => {
        if (!confirm(`Are you sure you want to delete ${fileName}?`)) return;
        try {
            const { error } = await supabase.storage
                .from(bucketName)
                .remove([`${user?.id}/${fileName}`]);

            if (error) throw error;

            await logAction("DELETE", fileName);
            showToast('success', 'File deleted');
            fetchFiles();
        } catch (error: any) {
            showToast('error', error.message);
        }
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // 🔄 LOADING CHECK 🔄
    if (loadingProfile) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
                    <p className="text-gray-400 text-sm">Verifying Access...</p>
                </div>
            </div>
        );
    }

    // 🔒 APPROVAL CHECK 🔒

    if (!userProfile || userProfile.status === 'pending') {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 text-center">
                <div className="glass-panel p-10 rounded-2xl max-w-md animate-float">
                    <ShieldCheck className="w-16 h-16 text-yellow-400 mx-auto mb-6" />
                    <h1 className="text-2xl font-bold text-white mb-2">Account Pending Approval</h1>
                    <p className="text-gray-400 mb-6 text-sm">
                        Your account is waiting for administrator verification. <br />
                        For faster access, please message us directly.
                    </p>

                    <a
                        href="https://wa.me/94775933454"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white px-6 py-3 rounded-xl font-medium transition-all transform hover:scale-105 mb-4 shadow-lg shadow-green-500/20"
                    >
                        <span>Message Admin on WhatsApp</span>
                    </a>

                    <button
                        onClick={fetchProfile}
                        disabled={loadingProfile}
                        className="w-full glass-button mb-4 py-2 rounded-xl text-white text-sm flex items-center justify-center gap-2"
                    >
                        {loadingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : "I've been approved, Check Again"}
                    </button>

                    <button onClick={() => signOut()} className="text-sm text-gray-500 hover:text-white transition-colors">
                        Sign Out
                    </button>
                </div>
            </div>
        );
    }

    if (userProfile.status === 'rejected') {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 text-center">
                <div className="glass-panel p-10 rounded-2xl max-w-md animate-float border-red-500/30">
                    <X className="w-16 h-16 text-red-400 mx-auto mb-6" />
                    <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
                    <p className="text-gray-400 mb-6">Your account request has been rejected by the administrator.</p>
                    <button onClick={() => signOut()} className="glass-button px-6 py-2 rounded-xl text-white">
                        Sign Out
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-6 relative">
            {/* Background Elements */}
            <div className="fixed top-1/4 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[100px] -z-10 animate-float" style={{ animationDelay: '0s' }} />
            <div className="fixed bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[100px] -z-10 animate-float" style={{ animationDelay: '2s' }} />

            {/* Header */}
            <header className="flex justify-between items-center mb-10 max-w-6xl mx-auto glass-panel p-4 rounded-xl">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center backdrop-blur-md overflow-hidden">
                        <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-200 to-purple-200">
                            A7 Vault
                        </h1>
                        <span className="flex items-center gap-1 text-[10px] text-green-400 border border-green-500/30 px-1.5 rounded-full w-fit mt-0.5">
                            <ShieldCheck className="w-3 h-3" /> Encrypted & Logged
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-400 hidden sm:inline">{user?.email}</span>
                    <button onClick={() => signOut()} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white" title="Sign Out">
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </header>

            <main className="max-w-6xl mx-auto space-y-8">
                {/* 👑 ADMIN PANEL (Only visible if role is admin) */}
                {userProfile?.role === 'admin' && <AdminPanel />}

                {/* Upload Zone */}
                <div
                    className={`
               relative glass-panel rounded-2xl text-center transition-all duration-300 border-dashed border-2 flex flex-col items-center justify-center
               ${dragActive ? 'border-blue-400 bg-blue-500/10 scale-[1.02]' : 'border-white/20 hover:border-white/40'}
            `}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                >
                    <input
                        type="file"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                                handleFileUpload(e.target.files[0]);
                                e.target.value = ''; // Reset
                            }
                        }}
                    />
                    <div className="flex flex-col items-center gap-4 w-full h-full p-10 pointer-events-none">
                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-2 transition-colors">
                            {uploading ? <Loader2 className="w-8 h-8 animate-spin text-blue-400" /> : <Upload className="w-8 h-8 text-blue-400" />}
                        </div>
                        <div>
                            <h2 className="text-xl font-medium text-white mb-1">Tap or Drag to upload</h2>
                            <p className="text-gray-400 text-sm">Everything is encrypted before leaving your device</p>
                        </div>
                    </div>
                    {uploading && (
                        <div className="absolute bottom-0 left-0 h-1 bg-blue-500 transition-all duration-300 rounded-b-2xl" style={{ width: '100%' }} />
                    )}
                </div>

                {/* Files Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {loadingFiles ? (
                        [1, 2, 3].map((i) => (
                            <div key={i} className="h-32 glass-panel rounded-xl animate-pulse bg-white/5" />
                        ))
                    ) : files.length === 0 ? (
                        <div className="col-span-full text-center py-20 text-gray-500">
                            No files found. Upload something to the vault.
                        </div>
                    ) : (
                        files.map((file) => (
                            <div key={file.id || file.name} className="glass-panel p-5 rounded-xl group hover:bg-white/10 transition-all hover:scale-[1.02] flex flex-col justify-between h-40 relative overflow-hidden">
                                <div className="flex justify-between items-start">
                                    <div className="p-2 bg-blue-500/20 rounded-lg text-blue-300">
                                        <File className="w-6 h-6" />
                                    </div>
                                    <div className="flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => handleDownload(file.name, file.metadata?.originalType)} className="p-2 hover:bg-white/20 rounded-lg text-gray-300 hover:text-white" title="Download & Decrypt">
                                            <Download className="w-5 h-5" />
                                        </button>
                                        <button onClick={() => handleDelete(file.name)} className="p-2 hover:bg-red-500/20 rounded-lg text-gray-300 hover:text-red-400" title="Delete">
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-white font-medium truncate mb-1" title={file.name}>{file.name}</h3>
                                    <div className="flex justify-between text-xs text-gray-400">
                                        <span>{file.metadata ? formatSize(file.metadata.size) : 'Unknown'}</span>
                                        <span>{new Date(file.created_at).toLocaleDateString()}</span>
                                    </div>
                                    {file.metadata?.encrypted && (
                                        <div className="mt-2 text-[10px] uppercase tracking-wider text-green-500/70 border-t border-white/5 pt-2 flex items-center gap-1">
                                            <ShieldCheck className="w-3 h-3" /> Encrypted
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </main>

            {/* Toast */}
            {toast && (
                <div className={`fixed bottom-8 right-8 p-4 rounded-xl glass-panel border-l-4 ${toast.type === 'success' ? 'border-l-green-500 text-green-200' : 'border-l-red-500 text-red-200'} shadow-lg animate-float flex items-center gap-3 z-50`}>
                    <span>{toast.message}</span>
                    <button onClick={() => setToast(null)} className="hover:text-white"><X className="w-4 h-4" /></button>
                </div>
            )}
        </div>
    );
}
