"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Trash2, CheckCircle, XCircle, UserPlus, Loader2, ShieldAlert } from "lucide-react";

interface Profile {
    id: string;
    email: string;
    role: string;
    status: 'pending' | 'approved' | 'rejected';
    created_at: string;
}

export default function AdminPanel() {
    const [users, setUsers] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [newUserEmail, setNewUserEmail] = useState("");
    const [newUserPassword, setNewUserPassword] = useState("");
    const [isAddingUser, setIsAddingUser] = useState(false);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setUsers(data || []);
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setLoading(false);
        }
    };

    const updateUserStatus = async (userId: string, newStatus: string) => {
        setActionLoading(userId);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ status: newStatus })
                .eq('id', userId);

            if (error) throw error;
            // Update local state
            setUsers(users.map(u => u.id === userId ? { ...u, status: newStatus as any } : u));
        } catch (error) {
            console.error('Error updating status:', error);
            alert("Failed to update status");
        } finally {
            setActionLoading(null);
        }
    };

    const deleteUser = async (userId: string) => {
        if (!confirm("Are you sure you want to permanently delete this user?")) return;
        setActionLoading(userId);
        try {
            // Call the database function we created
            const { error } = await supabase.rpc('delete_user_by_admin', { target_user_id: userId });

            if (error) throw error;
            setUsers(users.filter(u => u.id !== userId));
        } catch (error: any) {
            console.error('Error deleting user:', error);
            alert("Error deleting user: " + error.message);
        } finally {
            setActionLoading(null);
        }
    };

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setActionLoading("add_new");
        try {
            // Create user in Supabase Auth
            const { data, error } = await supabase.auth.signUp({
                email: newUserEmail,
                password: newUserPassword,
                options: {
                    data: {
                        status: 'approved' // Auto-approve users added by admin
                    }
                }
            });

            if (error) throw error;

            // Wait a moment for trigger to run, then update their status to approved
            if (data.user) {
                // Manually ensure approved status (trigger makes it pending by default)
                await new Promise(resolve => setTimeout(resolve, 1000));
                await supabase.from('profiles').update({ status: 'approved' }).eq('id', data.user.id);

                alert("User added successfully!");
                setNewUserEmail("");
                setNewUserPassword("");
                setIsAddingUser(false);
                fetchUsers();
            }
        } catch (error: any) {
            alert("Error adding user: " + error.message);
        } finally {
            setActionLoading(null);
        }
    };

    if (loading) return <div className="p-10 text-center text-gray-400">Loading Admin Panel...</div>;

    return (
        <div className="glass-panel p-6 rounded-2xl mb-8 border border-purple-500/20">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/20 rounded-lg">
                        <ShieldAlert className="w-6 h-6 text-purple-300" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">Admin Control</h2>
                        <p className="text-xs text-purple-300/70">Manage Users & Access</p>
                    </div>
                </div>
                <button
                    onClick={() => setIsAddingUser(!isAddingUser)}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
                >
                    <UserPlus className="w-4 h-4" />
                    {isAddingUser ? 'Cancel' : 'Add User'}
                </button>
            </div>

            {isAddingUser && (
                <form onSubmit={handleAddUser} className="mb-6 p-4 bg-white/5 rounded-xl border border-white/10 animate-float">
                    <h3 className="text-sm font-medium text-white mb-3">Add New User (Auto-Approved)</h3>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <input
                            type="email"
                            placeholder="User Email"
                            value={newUserEmail}
                            onChange={e => setNewUserEmail(e.target.value)}
                            className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                            required
                        />
                        <input
                            type="password"
                            placeholder="Unsafe Password (Admin Set)"
                            value={newUserPassword}
                            onChange={e => setNewUserPassword(e.target.value)}
                            className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                            required
                        />
                        <button
                            type="submit"
                            disabled={!!actionLoading}
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium"
                        >
                            {actionLoading === 'add_new' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
                        </button>
                    </div>
                </form>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-400 min-w-[600px]">
                    <thead className="text-xs uppercase bg-white/5 text-gray-300">
                        <tr>
                            <th className="px-4 py-3 rounded-l-lg">User</th>
                            <th className="px-4 py-3">Role</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Joined</th>
                            <th className="px-4 py-3 rounded-r-lg text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {users.map((user) => (
                            <tr key={user.id} className="hover:bg-white/5 transition-colors">
                                <td className="px-4 py-3 font-medium text-white">{user.email}</td>
                                <td className="px-4 py-3">
                                    <span className={`px-2 py-0.5 rounded textxs ${user.role === 'admin' ? 'bg-purple-500/20 text-purple-300' : 'bg-gray-500/20 text-gray-300'}`}>
                                        {user.role}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`
                                        px-2 py-0.5 rounded text-xs border
                                        ${user.status === 'approved' ? 'bg-green-500/10 text-green-400 border-green-500/20' : ''}
                                        ${user.status === 'pending' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : ''}
                                        ${user.status === 'rejected' ? 'bg-red-500/10 text-red-400 border-red-500/20' : ''}
                                    `}>
                                        {user.status}
                                    </span>
                                </td>
                                <td className="px-4 py-3">{new Date(user.created_at).toLocaleDateString()}</td>
                                <td className="px-4 py-3 text-right flex items-center justify-end gap-2">
                                    {user.role !== 'admin' && (
                                        <>
                                            {user.status === 'pending' && (
                                                <>
                                                    <button
                                                        onClick={() => updateUserStatus(user.id, 'approved')}
                                                        disabled={!!actionLoading}
                                                        className="p-1.5 bg-green-500/20 hover:bg-green-500/40 text-green-300 rounded-lg transition-colors"
                                                        title="Approve"
                                                    >
                                                        <CheckCircle className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => updateUserStatus(user.id, 'rejected')}
                                                        disabled={!!actionLoading}
                                                        className="p-1.5 bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-lg transition-colors"
                                                        title="Reject"
                                                    >
                                                        <XCircle className="w-4 h-4" />
                                                    </button>
                                                </>
                                            )}
                                            <button
                                                onClick={() => deleteUser(user.id)}
                                                disabled={!!actionLoading}
                                                className="p-1.5 bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-lg transition-colors"
                                                title="Delete User"
                                            >
                                                {actionLoading === user.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                            </button>
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
