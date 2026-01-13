"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase";
import { Upload, File, Trash2, Download, LogOut, Loader2, X, ShieldCheck, Eye, FileText, Archive, FileImage, Filter, Grid, Film } from "lucide-react";
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

    // Filter State
    const [activeFilter, setActiveFilter] = useState<'all' | 'image' | 'video' | 'document' | 'archive'>('all');

    // Preview State
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewName, setPreviewName] = useState<string | null>(null);
    const [previewing, setPreviewing] = useState(false);

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

    // Encryption Helper (Web Crypto API - High Performance)
    const getCryptoKey = async (secret: string) => {
        const encoder = new TextEncoder();
        const keyData = encoder.encode(secret);
        const hash = await crypto.subtle.digest("SHA-256", keyData);
        return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
    };

    const encryptFile = async (file: File): Promise<Blob> => {
        // Use Native Web Crypto for performance & low memory usage
        const key = await getCryptoKey(ENCRYPTION_KEY);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const fileBuffer = await file.arrayBuffer();

        const encryptedBuffer = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            key,
            fileBuffer
        );

        // Combine IV (12 bytes) + Ciphertext
        return new Blob([iv, encryptedBuffer], { type: 'application/octet-stream' });
    };

    const decryptFile = async (blob: Blob): Promise<Blob> => {
        try {
            // Try Web Crypto (AES-GCM) first - Fast & Memory Efficient
            const buffer = await blob.arrayBuffer();

            // Check if it's likely a Legacy CryptoJS file (Base64 string)
            // Legacy files start with "U2FsdGVkX1" (Salted__ in Base64)
            const firstBytes = new Uint8Array(buffer.slice(0, 10));
            const header = String.fromCharCode(...firstBytes);

            if (header === 'U2FsdGVkX1') {
                throw new Error("Legacy Format Detected");
            }

            const key = await getCryptoKey(ENCRYPTION_KEY);
            const iv = buffer.slice(0, 12);
            const data = buffer.slice(12);

            const decryptedBuffer = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv: new Uint8Array(iv) },
                key,
                data
            );

            return new Blob([decryptedBuffer]);
        } catch (e: any) {
            // Fallback to Legacy CryptoJS (Slow, High Memory)
            // Used for files uploaded before this update
            console.warn("Attempting Legacy Decryption...", e.message);
            const text = await blob.text();
            const decrypted = CryptoJS.AES.decrypt(text, ENCRYPTION_KEY);
            const typedArray = convertWordArrayToUint8Array(decrypted);
            return new Blob([typedArray]);
        }
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
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // Increased to 50MB to accommodate small videos

    const handleFileUpload = async (file: File) => {
        if (!user) return;

        // 1. File Size Check
        if (file.size > MAX_FILE_SIZE) {
            showToast('error', `File too large (${formatSize(file.size)}). Limit is 50MB for browser encryption.`);
            return;
        }

        setUploading(true);
        showToast('success', 'Processing encryption...'); // Immediate feedback

        // Give UI time to render loading state on mobile
        await new Promise(resolve => setTimeout(resolve, 500));

        try {
            // Encrypt before upload
            let encryptedBlob;
            try {
                encryptedBlob = await encryptFile(file);
            } catch (encError) {
                console.error("Encryption Memory Error", encError);
                throw new Error("Phone ran out of memory during encryption. Try a smaller file.");
            }

            const filePath = `${user.id}/${file.name}`;

            const { error } = await supabase.storage.from(bucketName).upload(filePath, encryptedBlob, {
                upsert: true,
                contentType: 'application/encrypted',
                metadata: { originalType: file.type, encrypted: 'true' }
            });

            if (error) throw error;

            await logAction("UPLOAD", file.name, `Size: ${file.size} bytes`);
            showToast('success', `Encrypted & Uploaded ${file.name}`);
            fetchFiles();
        } catch (error: any) {
            console.error("Upload failed:", error);
            showToast('error', error.message || "Upload failed. Try a smaller file.");
        } finally {
            setUploading(false);
        }
    };

    // Preview Logic
    const handlePreview = async (e: React.MouseEvent, fileName: string, originalType: string = 'image/png') => {
        e.preventDefault();
        e.stopPropagation();
        console.log("Starting preview for:", fileName);

        setPreviewing(true);
        setPreviewName(fileName);

        try {
            const { data, error } = await supabase.storage
                .from(bucketName)
                .download(`${user?.id}/${fileName}`);

            if (error) throw error;

            let finalBlob = data;
            try {
                finalBlob = await decryptFile(data);
            } catch (e) {
                console.warn("Decryption failed for preview", e);
            }

            // Determine Blob type for preview
            const isPdf = fileName.toLowerCase().endsWith('.pdf') || originalType === 'application/pdf';
            const isTxt = fileName.toLowerCase().endsWith('.txt');
            const isVideo = fileName.toLowerCase().match(/\.(mp4|webm|ogg|mov)$/) || originalType.startsWith('video/');

            let blobType = originalType;
            if (isPdf) blobType = 'application/pdf';
            else if (isTxt) blobType = 'text/plain';
            else if (isVideo) blobType = originalType || 'video/mp4';

            const url = window.URL.createObjectURL(new Blob([finalBlob], { type: blobType }));
            setPreviewUrl(url);
        } catch (error: any) {
            console.error("Preview Error", error);
            showToast('error', "Failed to load preview");
            setPreviewName(null); // Close modal on error
        } finally {
            setPreviewing(false);
        }
    };

    const closePreview = () => {
        if (previewUrl) {
            window.URL.revokeObjectURL(previewUrl);
        }
        setPreviewUrl(null);
        setPreviewName(null);
        setPreviewing(false);
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

    // Filter Logic
    const filteredFiles = files.filter(file => {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const type = file.metadata?.originalType || '';

        const isImage = type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
        const isVideo = type.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext);
        const isPdf = type === 'application/pdf' || ext === 'pdf';
        const isDoc = ['doc', 'docx', 'txt', 'rtf'].includes(ext);
        const isArchive = ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext);

        if (activeFilter === 'image') return isImage;
        if (activeFilter === 'video') return isVideo;
        if (activeFilter === 'document') return isDoc || isPdf;
        if (activeFilter === 'archive') return isArchive;
        return true; // 'all'
    });

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

                {/* Filter Tabs */}
                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                    {[
                        { id: 'all', label: 'All Files', icon: Grid },
                        { id: 'image', label: 'Images', icon: FileImage },
                        { id: 'video', label: 'Videos', icon: Film },
                        { id: 'document', label: 'Documents', icon: FileText },
                        { id: 'archive', label: 'Archives', icon: Archive },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveFilter(tab.id as any)}
                            className={`
                                flex items-center gap-2 px-4 py-2 rounded-xl transition-all whitespace-nowrap
                                ${activeFilter === tab.id
                                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                                    : 'glass-panel text-gray-400 hover:text-white hover:bg-white/10'}
                            `}
                        >
                            <tab.icon className="w-4 h-4" />
                            <span>{tab.label}</span>
                        </button>
                    ))}
                </div>

                {/* Files Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {loadingFiles ? (
                        [1, 2, 3].map((i) => (
                            <div key={i} className="h-32 glass-panel rounded-xl animate-pulse bg-white/5" />
                        ))
                    ) : filteredFiles.length === 0 ? (
                        <div className="col-span-full text-center py-20 text-gray-500">
                            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Filter className="w-8 h-8 text-gray-600" />
                            </div>
                            <p>No files found in this category.</p>
                        </div>
                    ) : (
                        filteredFiles.map((file) => {
                            // File Type Detection
                            const ext = file.name.split('.').pop()?.toLowerCase() || '';
                            const type = file.metadata?.originalType || '';

                            const isImage = type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
                            const isVideo = type.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext);
                            const isPdf = type === 'application/pdf' || ext === 'pdf';
                            const isDoc = ['doc', 'docx', 'txt', 'rtf'].includes(ext);
                            const isArchive = ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext);

                            // Determine Icon & Color
                            let Icon = File;
                            let colorClass = 'bg-blue-500/20 text-blue-300';

                            if (isImage) { Icon = FileImage; colorClass = 'bg-purple-500/20 text-purple-300'; }
                            else if (isVideo) { Icon = Film; colorClass = 'bg-pink-500/20 text-pink-300'; }
                            else if (isPdf) { Icon = FileText; colorClass = 'bg-red-500/20 text-red-300'; }
                            else if (isDoc) { Icon = FileText; colorClass = 'bg-indigo-500/20 text-indigo-300'; }
                            else if (isArchive) { Icon = Archive; colorClass = 'bg-yellow-500/20 text-yellow-300'; }

                            // Check if previewable (Image, PDF, Video, or Text)
                            const isPreviewable = isImage || isPdf || isDoc || isVideo;

                            return (
                                <div key={file.id || file.name} className="glass-panel p-5 rounded-xl group hover:bg-white/10 transition-all hover:scale-[1.02] flex flex-col justify-between h-40 relative overflow-hidden">
                                    <div className="flex justify-between items-start">
                                        <div className={`p-2 rounded-lg ${colorClass}`}>
                                            <Icon className="w-6 h-6" />
                                        </div>
                                        <div className="flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                            {isPreviewable && (
                                                <button onClick={(e) => handlePreview(e, file.name, file.metadata?.originalType)} className="p-2 hover:bg-white/20 rounded-lg text-gray-300 hover:text-white" title="View">
                                                    <Eye className="w-5 h-5" />
                                                </button>
                                            )}
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
                            )
                        })
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

            {/* Preview Modal */}
            {(previewName) && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={closePreview}>
                    <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center justify-center p-2" onClick={(e) => e.stopPropagation()}>

                        <div className="absolute top-[-40px] right-0 flex gap-4">
                            <a
                                href={previewUrl || '#'}
                                download={previewName}
                                className={`text-white hover:text-blue-400 transition-colors ${!previewUrl ? 'invisible' : ''}`}
                                title="Download Original"
                            >
                                <Download className="w-6 h-6" />
                            </a>
                            <button onClick={closePreview} className="text-white hover:text-red-400 transition-colors">
                                <X className="w-8 h-8" />
                            </button>
                        </div>

                        {previewing && !previewUrl ? (
                            <div className="flex flex-col items-center gap-4 text-white">
                                <Loader2 className="w-12 h-12 animate-spin text-blue-400" />
                                <p>Decrypting & Loading...</p>
                            </div>
                        ) : (
                            // Content Switcher based on type
                            previewName.toLowerCase().endsWith('.pdf') ? (
                                <iframe
                                    src={previewUrl!}
                                    className="w-full h-[80vh] rounded-lg shadow-2xl border border-white/10 bg-white"
                                    title="PDF Preview"
                                />
                            ) : previewName.toLowerCase().match(/\.(mp4|webm|ogg|mov)$/) ? (
                                <video
                                    src={previewUrl!}
                                    controls
                                    className="max-w-full max-h-[85vh] rounded-lg shadow-2xl border border-white/10 bg-black"
                                >
                                    Your browser does not support the video tag.
                                </video>
                            ) : previewName.toLowerCase().match(/\.(txt|md|log)$/) ? (
                                <iframe
                                    src={previewUrl!}
                                    className="w-full h-[80vh] rounded-lg shadow-2xl border border-white/10 bg-white"
                                    title="Text Preview"
                                />
                            ) : previewName.toLowerCase().match(/\.(doc|docx)$/) ? (
                                <div className="glass-panel p-10 rounded-2xl flex flex-col items-center text-center">
                                    <FileText className="w-20 h-20 text-blue-400 mb-4" />
                                    <h2 className="text-xl font-bold text-white mb-2">Preview Not Supported</h2>
                                    <p className="text-gray-400 mb-6">Word documents cannot be securely verified in the browser yet.</p>
                                    <a
                                        href={previewUrl!}
                                        download={previewName}
                                        className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl flex items-center gap-2 transition-all"
                                    >
                                        <Download className="w-5 h-5" /> Download to View
                                    </a>
                                </div>
                            ) : (
                                <img
                                    src={previewUrl!}
                                    onError={(e) => { e.currentTarget.style.display = 'none'; showToast('error', 'Image data corrupted or invalid'); }}
                                    alt="Decrypted Preview"
                                    className="max-w-full max-h-[85vh] rounded-lg shadow-2xl border border-white/10"
                                />
                            )
                        )}

                        {!previewing && <p className="text-gray-400 mt-4 text-sm">{previewName}</p>}
                    </div>
                </div>
            )}
        </div>
    );
}
