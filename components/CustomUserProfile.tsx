"use client";

import { useUser } from "@clerk/nextjs";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Menu, X } from "lucide-react";

export default function CustomUserProfile() {
  const { user, isLoaded } = useUser();
  const [tab, setTab] = useState("profile");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [username, setUsername] = useState(user?.username || "");
  const [profileImage, setProfileImage] = useState(user?.imageUrl || "");
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [newEmail, setNewEmail] = useState("");
  // Removed unused emailList state to satisfy @typescript-eslint/no-unused-vars
  // const [emailList, setEmailList] = useState(user?.emailAddresses || []);

  // Security tab state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");

  if (!isLoaded || !user) return <div className="p-8 text-white">Loading...</div>;

  // Handlers
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    try {
      setIsSaving(true);
      setError("");
      setSuccess("");
      await user.setProfileImage({ file });
      setProfileImage(URL.createObjectURL(file));
      setSuccess("Profile image updated!");
    } catch {
      setError("Failed to update profile image.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveUsername = async () => {
    setIsSaving(true);
    setError("");
    setSuccess("");
    try {
      await user.update({ username });
      setSuccess("Username updated!");
    } catch {
      setError("Failed to update username.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddEmail = async () => {
    if (!newEmail) return;
    setIsSaving(true);
    setError("");
    setSuccess("");
    try {
      await user.createEmailAddress({ email: newEmail });
      setSuccess("Email added! Please verify your new email.");
      setNewEmail("");
      // setEmailList(user.emailAddresses);
    } catch {
      setError("Failed to add email.");
    } finally {
      setIsSaving(false);
    }
  };

  // Security tab handlers
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordSuccess("");
    setPasswordError("");
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    try {
      await user.updatePassword({ newPassword, currentPassword });
      setPasswordSuccess("Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setPasswordError("Failed to update password.");
    }
  };

  // Removed unused handleSignOutSession to satisfy @typescript-eslint/no-unused-vars
  // const handleSignOutSession = async (sessionId: string) => {
  //   setSignOutSessionId(sessionId);
  //   setSignOutError("");
  //   setSignOutSuccess("");
  //   try {
  //     setSignOutSuccess("Session management is not supported.");
  //   } catch {
  //     setSignOutError("An error occurred.");
  //   } finally {
  //     setSignOutSessionId("");
  //   }
  // };

  const handleTabChange = (newTab: string) => {
    setTab(newTab);
    setIsMobileMenuOpen(false); // Close mobile menu when tab changes
  };

  // UI
  return (
    <div className="flex flex-col lg:flex-row w-full h-full bg-zinc-900 text-white rounded-lg overflow-hidden shadow-lg">
      {/* Mobile Header */}
      <div className="lg:hidden flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-950">
        <h2 className="text-xl font-bold">Account</h2>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 rounded-md hover:bg-zinc-800 transition-colors"
        >
          {isMobileMenuOpen ? (
            <X className="w-6 h-6" />
          ) : (
            <Menu className="w-6 h-6" />
          )}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-50">
          <div className="absolute top-0 left-0 w-64 h-full bg-zinc-950 border-r border-zinc-800">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <h2 className="text-xl font-bold">Account</h2>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 rounded-md hover:bg-zinc-800 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <nav className="flex flex-col gap-2 p-4">
              <button
                className={cn(
                  "text-left px-4 py-3 rounded transition-all",
                  tab === "profile"
                    ? "bg-zinc-800 text-white font-semibold"
                    : "hover:bg-zinc-800 text-zinc-300"
                )}
                onClick={() => handleTabChange("profile")}
              >
                <span className="inline-flex items-center gap-3">
                  <span className="inline-block w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center">
                    <svg width="16" height="16" fill="none"><circle cx="8" cy="8" r="7" stroke="#fff" strokeWidth="2" /></svg>
                  </span>
                  Profile
                </span>
              </button>
              <button
                className={cn(
                  "text-left px-4 py-3 rounded transition-all",
                  tab === "security"
                    ? "bg-zinc-800 text-white font-semibold"
                    : "hover:bg-zinc-800 text-zinc-300"
                )}
                onClick={() => handleTabChange("security")}
              >
                <span className="inline-flex items-center gap-3">
                  <span className="inline-block w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center">
                    <svg width="16" height="16" fill="none"><path d="M8 2l6 3v3c0 4.418-3.582 8-8 8S0 12.418 0 8V5l6-3z" fill="#fff" /></svg>
                  </span>
                  Security
                </span>
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <div className="hidden lg:flex w-64 bg-zinc-950 border-r border-zinc-800 flex-col py-8 px-4">
        <h2 className="text-2xl font-bold mb-8">Account</h2>
        <nav className="flex flex-col gap-2">
          <button
            className={cn(
              "text-left px-4 py-2 rounded transition-all",
              tab === "profile"
                ? "bg-zinc-800 text-white font-semibold"
                : "hover:bg-zinc-800 text-zinc-300"
            )}
            onClick={() => setTab("profile")}
          >
            <span className="inline-flex items-center gap-2">
              <span className="inline-block w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center">
                <svg width="16" height="16" fill="none"><circle cx="8" cy="8" r="7" stroke="#fff" strokeWidth="2" /></svg>
              </span>
              Profile
            </span>
          </button>
          <button
            className={cn(
              "text-left px-4 py-2 rounded transition-all",
              tab === "security"
                ? "bg-zinc-800 text-white font-semibold"
                : "hover:bg-zinc-800 text-zinc-300"
            )}
            onClick={() => setTab("security")}
          >
            <span className="inline-flex items-center gap-2">
              <span className="inline-block w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center">
                <svg width="16" height="16" fill="none"><path d="M8 2l6 3v3c0 4.418-3.582 8-8 8S0 12.418 0 8V5l6-3z" fill="#fff" /></svg>
              </span>
              Security
            </span>
          </button>
        </nav>
        <div className="flex-1" />
      </div>

      {/* Main Content */}
      <div className="flex-1 bg-zinc-900 p-4 lg:p-10 overflow-y-auto">
        {tab === "profile" && (
          <>
            <h3 className="text-xl font-bold mb-8">Profile details</h3>
            {/* Profile image */}
            <div className="flex flex-col sm:flex-row items-center gap-8 mb-8">
              <div className="flex flex-col items-center gap-2">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={profileImage} alt="Profile" />
                  <AvatarFallback>{user.username?.[0] || "U"}</AvatarFallback>
                </Avatar>
                <label className="text-xs text-zinc-400 cursor-pointer">
                  Update profile
                  <Input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                </label>
              </div>
            </div>
            {/* Username */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800 py-4 gap-4">
              <div>
                <div className="font-semibold">Username</div>
                <div className="text-zinc-300">{user.username}</div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-white w-full sm:w-40"
                />
                <Button size="sm" onClick={handleSaveUsername} disabled={isSaving}>
                  Update username
                </Button>
              </div>
            </div>
            {/* Email addresses */}
            <div className="border-b border-zinc-800 py-4">
              <div className="font-semibold mb-2">Email addresses</div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {user.emailAddresses.map((e) => (
                  <span key={e.id} className="text-zinc-300">
                    {e.emailAddress}
                    {e.id === user.primaryEmailAddressId && (
                      <span className="ml-2 px-2 py-0.5 text-xs rounded bg-zinc-700 text-zinc-200">Primary</span>
                    )}
                  </span>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                <Input
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="Add email address"
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
                <Button size="sm" onClick={handleAddEmail} disabled={isSaving || !newEmail}>
                  Add email address
                </Button>
              </div>
            </div>
            {/* Connected accounts */}
            <div className="py-4">
              <div className="font-semibold mb-2">Connected accounts</div>
              <div className="flex gap-2 items-center">
                <Button size="sm" variant="outline" className="bg-zinc-800 border-zinc-700 text-white opacity-60 cursor-not-allowed" disabled>
                  + Connect account
                </Button>
                <span className="text-zinc-400 text-xs">(Coming soon)</span>
              </div>
            </div>
            {/* Success/Error messages */}
            {success && <div className="text-green-400 text-sm mt-4">{success}</div>}
            {error && <div className="text-red-400 text-sm mt-4">{error}</div>}
          </>
        )}
        {tab === "security" && (
          <>
            <h3 className="text-xl font-bold mb-8">Security</h3>
            {/* Update Password */}
            <form onSubmit={handleUpdatePassword} className="mb-8 max-w-md">
              <div className="font-semibold mb-2">Update password</div>
              <Input
                type="password"
                placeholder="Current password"
                className="bg-zinc-800 border-zinc-700 text-white mb-2"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
              />
              <Input
                type="password"
                placeholder="New password"
                className="bg-zinc-800 border-zinc-700 text-white mb-2"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
              />
              <Input
                type="password"
                placeholder="Confirm new password"
                className="bg-zinc-800 border-zinc-700 text-white mb-2"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
              />
              <Button type="submit" size="sm" className="mt-2" disabled={isSaving}>
                Update password
              </Button>
              {passwordSuccess && <div className="text-green-400 text-sm mt-2">{passwordSuccess}</div>}
              {passwordError && <div className="text-red-400 text-sm mt-2">{passwordError}</div>}
            </form>
            {/* Active Devices */}
            <div className="mb-8 max-w-md">
              <div className="font-semibold mb-2">Active devices</div>
              <div className="text-zinc-400 text-sm">Session management is not supported.</div>
              {/* {signOutSuccess && <div className="text-green-400 text-sm mt-2">{signOutSuccess}</div>}
              {signOutError && <div className="text-red-400 text-sm mt-2">{signOutError}</div>} */}
            </div>
            {/* Delete Account */}
            {/*<form onSubmit={handleDeleteAccount} className="max-w-md">
              <div className="font-semibold mb-2 text-red-400">Delete account</div>
              <div className="text-zinc-400 text-xs mb-2">This action is irreversible. Type <span className="font-bold text-red-400">DELETE</span> to confirm.</div>
              <Input
                value={deleteConfirm}
                onChange={e => setDeleteConfirm(e.target.value)}
                placeholder="Type DELETE to confirm"
                className="bg-zinc-800 border-zinc-700 text-white mb-2"
              />
              <Button type="submit" size="sm" variant="destructive" className="mt-2" disabled={deleting}>
                {deleting ? "Deleting..." : "Delete account"}
              </Button>
              {deleteSuccess && <div className="text-green-400 text-sm mt-2">{deleteSuccess}</div>}
              {deleteError && <div className="text-red-400 text-sm mt-2">{deleteError}</div>}
            </form>*/}
          </>
        )}
      </div>
    </div>
  );
}
