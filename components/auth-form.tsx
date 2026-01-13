"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Lock, Mail, Loader2, ArrowRight, UserPlus, LogIn, Check, X, Shield, User, Eye, EyeOff } from "lucide-react";

export default function AuthForm() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState<"sign_in" | "sign_up">("sign_in");
    const [mode, setMode] = useState<"magic_link" | "password">("password");
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [passwordStrength, setPasswordStrength] = useState(0);
    const [requestedRole, setRequestedRole] = useState<"user" | "admin">("user"); // New state for role selection
    const router = useRouter();

    useEffect(() => {
        if (view === 'sign_up') {
            let strength = 0;
            if (password.length >= 8) strength += 1;
            if (/[A-Z]/.test(password)) strength += 1;
            if (/[0-9]/.test(password)) strength += 1;
            if (/[^A-Za-z0-9]/.test(password)) strength += 1;
            setPasswordStrength(strength);
        }
    }, [password, view]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        if (view === 'sign_up' && passwordStrength < 3) {
            setMessage({ type: "error", text: "Password is too weak. Make it stronger." });
            setLoading(false);
            return;
        }

        try {
            if (view === "sign_up") {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            role: requestedRole, // Save the requested role in metadata
                            status: 'pending'     // Explicitly set status to pending
                        }
                    }
                });
                if (error) throw error;
                setMessage({ type: "success", text: "Account created! Waiting for Admin approval." });
                setView("sign_in");
            } else {
                if (mode === "password") {
                    const { error } = await supabase.auth.signInWithPassword({
                        email,
                        password,
                    });
                    if (error) throw error;
                    router.push("/dashboard");
                } else {
                    const { error } = await supabase.auth.signInWithOtp({
                        email,
                        options: {
                            emailRedirectTo: `${window.location.origin}/auth/callback`,
                        },
                    });
                    if (error) throw error;
                    setMessage({ type: "success", text: "Magic link sent! Check your email." });
                }
            }
        } catch (error: any) {
            setMessage({ type: "error", text: error.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full max-w-md p-8 rounded-2xl glass-panel animate-float">
            <div className="text-center mb-8">
                <div className="mx-auto w-24 h-24 bg-white/10 rounded-full flex items-center justify-center mb-6 backdrop-blur-md shadow-[0_0_30px_rgba(120,119,198,0.3)] overflow-hidden p-1 border border-white/20">
                    <img src="/A7-Vault/logo.png" alt="A7 Vault Logo" className="w-full h-full object-cover rounded-full" />
                </div>
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
                    {view === 'sign_in' ? 'Welcome Back' : 'Create Account'}
                </h1>
                <p className="text-gray-400 mt-2">
                    {view === 'sign_in' ? 'Yoonos Personal Vault' : 'Join the Future of Storage'}
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                    <div className="relative group">
                        <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-500 group-hover:text-white transition-colors" />
                        <input
                            type="email"
                            placeholder="Email address"
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30 transition-all"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                </div>

                {(mode === "password" || view === "sign_up") && (
                    <div className="space-y-2">
                        <div className="relative group">
                            <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-500 group-hover:text-white transition-colors" />
                            <input
                                type={showPassword ? "text" : "password"}
                                placeholder={view === 'sign_up' ? "Create Password" : "Password"}
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-10 text-white placeholder-gray-500 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30 transition-all"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={6}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-3 text-gray-500 hover:text-white transition-colors focus:outline-none"
                            >
                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>

                        {/* ✅ ROLE SELECTION (Only in Sign Up) */}
                        {view === 'sign_up' && (
                            <div className="flex bg-white/5 p-1 rounded-xl mt-4">
                                <button
                                    type="button"
                                    onClick={() => setRequestedRole('user')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-all ${requestedRole === 'user' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
                                        }`}
                                >
                                    <User className="w-4 h-4" /> User
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setRequestedRole('admin')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-all ${requestedRole === 'admin' ? 'bg-purple-500/20 text-purple-200 shadow-sm' : 'text-gray-400 hover:text-gray-200'
                                        }`}
                                >
                                    <Shield className="w-4 h-4" /> Admin
                                </button>
                            </div>
                        )}

                        {/* Password Strength Meter */}
                        {view === 'sign_up' && password && (
                            <div className="space-y-2 pt-2">
                                <div className="flex gap-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                                    <div className={`h-full transition-all duration-500 ${passwordStrength >= 1 ? 'w-1/4 bg-red-400' : 'w-0'}`} />
                                    <div className={`h-full transition-all duration-500 ${passwordStrength >= 2 ? 'w-1/4 bg-orange-400' : 'w-0'}`} />
                                    <div className={`h-full transition-all duration-500 ${passwordStrength >= 3 ? 'w-1/4 bg-yellow-400' : 'w-0'}`} />
                                    <div className={`h-full transition-all duration-500 ${passwordStrength >= 4 ? 'w-1/4 bg-green-400' : 'w-0'}`} />
                                </div>
                                <div className="flex justify-between text-xs text-gray-400 px-1">
                                    <span>Weak</span>
                                    <span>Strong</span>
                                </div>
                                <div className="text-xs space-y-1 text-gray-500">
                                    <p className={`flex items-center gap-1 ${password.length >= 8 ? 'text-green-400' : ''}`}>
                                        {password.length >= 8 ? <Check className="w-3 h-3" /> : <span className="w-3 h-3 inline-block" />} At least 8 characters
                                    </p>
                                    <p className={`flex items-center gap-1 ${/[0-9]/.test(password) ? 'text-green-400' : ''}`}>
                                        {/[0-9]/.test(password) ? <Check className="w-3 h-3" /> : <span className="w-3 h-3 inline-block" />} Contains number
                                    </p>
                                    <p className={`flex items-center gap-1 ${/[^A-Za-z0-9]/.test(password) ? 'text-green-400' : ''}`}>
                                        {/[^A-Za-z0-9]/.test(password) ? <Check className="w-3 h-3" /> : <span className="w-3 h-3 inline-block" />} Contains special char
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {message && (
                    <div
                        className={`p-3 rounded-lg text-sm ${message.type === "success" ? "bg-green-500/20 text-green-200" : "bg-red-500/20 text-red-200"
                            }`}
                    >
                        {message.text}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full glass-button py-3 rounded-xl font-medium text-white flex items-center justify-center gap-2 group"
                >
                    {loading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        <>
                            {view === 'sign_in' ? (mode === 'password' ? 'Enter Vault' : 'Send Magic Link') : 'Create Account'}
                            {view === 'sign_in' ? <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /> : <UserPlus className="w-4 h-4" />}
                        </>
                    )}
                </button>
            </form>

            <div className="mt-6 text-center text-sm text-gray-400 flex flex-col gap-3">
                {view === 'sign_in' ? (
                    <>
                        <button onClick={() => setMode(mode === 'password' ? 'magic_link' : 'password')} className="hover:text-white transition-colors">
                            {mode === 'password' ? 'Use Magic Link instead' : 'Use Password login'}
                        </button>
                        <div className="flex justify-center gap-1">
                            <span>New here?</span>
                            <button onClick={() => { setView('sign_up'); setMessage(null); }} className="text-blue-400 hover:text-blue-300 font-medium">
                                Sign Up
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="flex justify-center gap-1">
                        <span>Already have an account?</span>
                        <button onClick={() => { setView('sign_in'); setMessage(null); }} className="text-blue-400 hover:text-blue-300 font-medium">
                            Log In
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
