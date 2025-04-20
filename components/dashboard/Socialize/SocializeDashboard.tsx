"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Instagram, MoreHorizontal, Music, Plus, Youtube } from "lucide-react";
import { getPlatformIcon } from "./SocializeIcons";
import { MobileView } from "./MobileView";
import { useUser } from "@clerk/nextjs";

export default function Dashboard() {
  const [links, setLinks] = useState<{ platform: string; url: string }[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLink, setNewLink] = useState({ platform: "youtube", url: "" });
  const [logo, setLogo] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showEditImageModal, setShowEditImageModal] = useState(false);
  const [showEditDetailsModal, setShowEditDetailsModal] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const [profileTitle, setProfileTitle] = useState("@yourname");
  const [bio, setBio] = useState("@description");
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const [glowPosition, setGlowPosition] = useState({ x: 0, y: 0 });
  const [showUpdatePopup, setShowUpdatePopup] = useState(false);
  const [duration, setDuration] = useState(0);
  const [message, setMessage] = useState("");
  const { user } = useUser();
  const uniqueUsername = user?.username;
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setProfileTitle(uniqueUsername ?? "");
  }, [user]);

  const handleAddLink = async () => {
    if (newLink.url.trim()) {
      const updatedLinks = [...links, newLink];
      setLinks(updatedLinks);
      setShowAddModal(false);
      setNewLink({ platform: "youtube", url: "" });

      try {
        await updateUserData(uniqueUsername ?? "", { links: updatedLinks });
      } catch (err) {
        console.error("Failed to save links:", err);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setImage(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClear = () => {
    setImage(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const handleUpload = async () => {
    if (image) {
      setLogo(image);
      setShowEditImageModal(false);

      try {
        await updateUserData(uniqueUsername ?? "", { profileImage: image });
      } catch (err) {
        console.error("Failed to upload image:", err);
      }
    }
  };

  async function handleSaveDeatils() {
    setShowEditDetailsModal(false);

    try {
      await updateUserData(uniqueUsername ?? "", {
        username: profileTitle,
        bio,
      });
    } catch (err) {
      console.error("Failed to update profile info:", err);
    }
  }

  const handleAddUpdate = async () => {
    if (duration >= 1 && duration <= 24 && message.length > 0) {
      setShowUpdatePopup(false);

      try {
        await updateUserData(uniqueUsername ?? "", {
          notifications: [{ message, duration }],
        });
      } catch (err) {
        console.error("Failed to update popup message:", err);
      }
    }
  };

  const handleRemoveLink = async (indexToRemove: number) => {
    const updatedLinks = links.filter((_, index) => index !== indexToRemove);
    setLinks(updatedLinks);

    try {
      await updateUserData(uniqueUsername ?? "", { links: updatedLinks });
    } catch (error) {
      console.error("Failed to update links after removal:", error);
    }
  };

  useEffect(() => {
    async function fetchUserData() {
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/socialize?uniqueUsername=${uniqueUsername}`
        );
        const data = await res.json();
        if (res.ok) {
          setLinks(data.links || []);
          setProfileTitle(data.username || "");
          setBio(data.bio || "");
          setLogo(data.profileImage || null);
          setMessage(data.notifications?.[0]?.message || "");
          setDuration(data.notifications?.[0]?.duration || 0);
        }
      } catch (err) {
        console.error("Failed to load user data:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchUserData();
  }, [uniqueUsername]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
      setIsHovering(true);
    };

    const handleMouseLeave = () => {
      setIsHovering(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);

    // Cleanup
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setGlowPosition((prev) => ({
        x: prev.x + (mousePosition.x - prev.x) * 0.4,
        y: prev.y + (mousePosition.y - prev.y) * 0.4,
      }));
    }, 12);

    return () => clearInterval(interval);
  }, [mousePosition]);

  type UserData = {
    links?: { platform: string; url: string }[];
    profileImage?: string;
    username?: string;
    bio?: string;
    notifications?: { message: string; duration: number }[];
  };

  async function updateUserData(
    uniqueUsername: string,
    data: Partial<UserData>
  ) {
    const response = await fetch("/api/socialize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uniqueUsername, ...data }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to update user data");
    }

    return await response.json();
  }

  const handleCopyUrl = () => {
    const url = `http://localhost:3000/socialize/${uniqueUsername}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        alert("URL copied to clipboard!");
      })
      .catch((err) => {
        alert("Failed to copy URL.");
      });
  };

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <div className="flex flex-row flex-1 justify-center items-start p-20">
        <div
          className="fixed inset-0 -left-1/8 -top-20 z-[0] pointer-events-none
    bg-[radial-gradient(ellipse_at_top,_#0e6b9c_2%,_#0e6b9c_2%,_transparent_60%)]
    w-full h-[100vh] transition-all duration-700"
        />

        <div
          className="pointer-events-none fixed z-50 transition-opacity duration-300 ease-out"
          style={{
            left: `${glowPosition.x}px`,
            top: `${glowPosition.y}px`,
            width: "650px",
            height: "650px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(14, 107, 156, 0.3) 0%, rgba(14, 107, 156, 0.1) 40%, rgba(255,0,0,0) 70%)",
            transform: "translate(-50%, -50%)",
            opacity: isHovering ? 0.6 : 0,
            mixBlendMode: "screen",
            filter: "blur(10px)",
          }}
        />

        {/* Main Content */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-16 h-16 border-t-4 border-b-4 border-[#0e6b9c] rounded-full animate-spin"></div>
          </div>
        ) : (
          <main className="max-w-full relative ">
            <div className="bg-black/20 p-4 rounded-lg mb-8 w-min-fit">
              <div className="flex items-center justify-between gap-28">
                <div className="flex items-center gap-2 ">
                  <span className="text-orange-400">🔥</span>
                  <span className="text-white">Your link is live:</span>
                  <a
                    href={`http://localhost:3000/socialize/${uniqueUsername}`}
                    className="text-blue-400 hover:underline"
                  >
                    insturix.com/socialize/{uniqueUsername}
                  </a>
                </div>
                <button
                  className="bg-white text-black px-4 py-1.5 rounded-full text-sm hover:bg-gray-200 transition"
                  onClick={handleCopyUrl}
                >
                  Copy URL
                </button>
              </div>
            </div>

            {/* Profile Section */}
            <div className="mb-8">
              <div className="flex items-center gap-4 mb-6">
                {logo ? (
                  <img
                    src={logo}
                    alt="Profile"
                    className="w-16 h-16 rounded-full border-2 border-white"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center">
                    <img
                      src="/blogs/blank_profile.png"
                      alt="Profile"
                      className="w-16 h-16 rounded-full border-2 border-white"
                    />
                  </div>
                )}
                <div>
                  <h1 className="text-xl font-bold">
                    {profileTitle || "Title"}
                  </h1>
                  <p className="text-gray-400">{bio || "Your Bio"}</p>
                </div>
                <button
                  ref={buttonRef}
                  className="ml-auto"
                  onClick={() => setShowEditModal(true)}
                >
                  <MoreHorizontal className="w-6 h-6 text-gray-400" />
                </button>
              </div>
              <div className="flex gap-3 mb-6">
                <Instagram className="w-5 h-5 text-gray-400" />
                <Music className="w-5 h-5 text-gray-400" />
                <Youtube className="w-5 h-5 text-gray-400" />
              </div>
            </div>

            <button
              className="w-full bg-black/40 text-white py-3 rounded-lg mb-6 flex items-center justify-center gap-2 hover:bg-black/80 transition border border-[#0e6b9c]"
              onClick={() => setShowAddModal(true)}
            >
              <Plus className="w-5 h-5" />
              <span>Add</span>
            </button>

            {message == "" && duration == 0 ? (
              <div
                className="text-start text-gray-400 px-2 bg-black/70 w-fit py-1 rounded-md hover:bg-[#0c4362] transition-colors cursor-pointer"
                onClick={() => setShowUpdatePopup(true)}
              >
                <p>Add a New Update</p>
              </div>
            ) : (
              <div className="text-center text-gray-400 flex justify-start items-center gap-3">
                <div className="w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center">
                  <span className="text-xl">🔔</span>
                </div>
                <p className=" text-white font-bold">
                  {message} (Duration: {duration} hours)
                </p>
                <button
                  className="ml-2 p-2 rounded-full hover:bg-gray-700 transition"
                  onClick={() => setShowUpdatePopup(true)}
                  title="Edit Notification"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.232 5.232l3.536 3.536M9 13l6-6m2.121-2.121a3 3 0 114.243 4.243l-10 10a1 1 0 01-.293.207l-4 2a1 1 0 01-1.316-1.316l2-4a1 1 0 01.207-.293l10-10z"
                    />
                  </svg>
                </button>
              </div>
            )}

            <div className="space-y-4 mb-8 mt-5">
              {links.length !== 0 ? (
                links.map((link, index) => (
                  <div
                    key={index}
                    className="w-full bg-black/40 text-white py-3 rounded-lg mb-6 flex items-center justify-between gap-2 hover:bg-black/80 transition border border-[#0e6b9c] px-5"
                  >
                    <div className="flex items-center gap-4">
                      {getPlatformIcon(link.platform)}
                      <span className="text-white">{link.url}</span>
                    </div>
                    <button
                      className="text-gray-400 hover:text-white"
                      onClick={() => handleRemoveLink(index)}
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                ))
              ) : (
                <div className="mt-16 text-center text-gray-400">
                  <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">✨</span>
                  </div>
                  <p className="mb-2">Show the world who you are.</p>
                  <p>Add a link to get started.</p>
                </div>
              )}
            </div>

            {showEditModal && (
              <ProfileMenuPopup
                anchorRef={buttonRef as React.RefObject<HTMLElement>}
                onEditImage={() => {
                  setShowEditImageModal((prev) => !prev);
                }}
                onEditNameBio={() => {
                  setShowEditDetailsModal((prev) => !prev);
                }}
                onClose={() => setShowEditModal(false)}
              />
            )}

            {showEditImageModal && (
              <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                <div className="bg-black border border-[#45454c] rounded-2xl shadow-lg w-full max-w-md p-6 relative">
                  <button
                    onClick={() => setShowEditImageModal(false)}
                    className="absolute top-4 right-4 text-white text-2xl font-bold"
                  >
                    ×
                  </button>
                  <h2 className="text-2xl font-semibold text-center mb-6 ">
                    Upload image
                  </h2>

                  {!image ? (
                    <div
                      className="border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center mb-6 cursor-pointer"
                      onClick={() =>
                        fileInput.current && fileInput.current.click()
                      }
                    >
                      <svg
                        width="40"
                        height="48"
                        fill="none"
                        className="mb-4 text-white "
                        viewBox="0 0 40 48"
                      >
                        <rect
                          x="8"
                          y="8"
                          width="24"
                          height="32"
                          rx="2"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                        <path
                          d="M16 20h8M16 24h8"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                      <p className="text-white text-center">
                        <span className="font-medium">
                          Select file to upload,
                        </span>
                        <br />
                        or drag-and-drop file
                      </p>
                      <input
                        ref={fileInput}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp,image/heic,image/heif"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center mb-6">
                      <img
                        src={image}
                        alt="Preview"
                        className="max-h-56 max-w-full rounded-xl object-contain border mb-2"
                      />
                      <button
                        type="button"
                        className="text-sm text-blue-600 underline hover:text-blue-800"
                        onClick={() =>
                          fileInput.current && fileInput.current.click()
                        }
                      >
                        Change
                      </button>
                      <input
                        ref={fileInput}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp,image/heic,image/heif"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                    </div>
                  )}

                  <p className="text-xs text-white  text-center mb-6">
                    Allowed file types: JPEG, PNG, WebP, GIF, AVIF, BMP, HEIC,
                    HEIF
                  </p>
                  <div className="flex gap-4">
                    <button
                      className={`flex-1 py-2 rounded-full border border-gray-200 font-semibold ${
                        image
                          ? "bg-white text-gray-700 hover:bg-gray-100 cursor-pointer"
                          : "bg-gray-100 text-gray-400 cursor-not-allowed"
                      }`}
                      disabled={!image}
                      onClick={handleClear}
                    >
                      Clear
                    </button>
                    <button
                      className={`flex-1 py-2 rounded-full border border-gray-200 font-semibold ${
                        image
                          ? "bg-gradient-to-r from-blue-600/80 to-purple-500/80 f shadow text-white cursor-pointer"
                          : "bg-gray-100 text-gray-400 cursor-not-allowed"
                      }`}
                      disabled={!image}
                      onClick={handleUpload}
                    >
                      Upload
                    </button>
                  </div>
                </div>
              </div>
            )}

            {showEditDetailsModal && (
              <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                <div className="bg-black rounded-3xl w-full max-w-lg p-8 relative border border-[#45454c]">
                  <button
                    onClick={() => setShowEditDetailsModal(false)}
                    className="absolute top-6 right-6 text-gray-400 hover:text-gray-700 text-2xl font-bold"
                    aria-label="Close"
                  >
                    ×
                  </button>
                  <h2 className="text-2xl font-semibold text-center mb-8">
                    Display bio
                  </h2>
                  <div className="mb-2">
                    <label
                      className="block text-gray-400 text-sm mb-1"
                      htmlFor="bio"
                    >
                      Bio
                    </label>
                    <textarea
                      id="bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      className="w-full rounded-xl  bg-[#121212] border-[#2d2d36] px-4 py-3 text-base outline-none border-none resize-none"
                      rows={3}
                      maxLength={80}
                    />
                    <div className="flex justify-end text-xs text-gray-400 mt-1">
                      {bio.length} / 80
                    </div>
                  </div>
                  <button
                    onClick={handleSaveDeatils}
                    className="w-full mt-6 bg-gradient-to-r from-blue-600/80 to-purple-500/80  shadow text-white font-semibold py-3 rounded-full text-lg transition"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}

            {showUpdatePopup && (
              <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 ">
                <div className="bg-black rounded-2xl p-8 w-[400px] shadow-2xl relative border border-[#45454c]">
                  <h2 className="text-xl font-bold mb-4 text-white">
                    Add New Update Popup
                  </h2>

                  <label className="block text-sm text-gray-300 mb-1">
                    Duration (hours)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={duration}
                    onChange={(e) =>
                      setDuration(Math.max(1, Math.min(24, +e.target.value)))
                    }
                    className="w-full mb-4 p-2 rounded bg-[#22222a] text-white border border-[#2d2d36] focus:outline-none"
                  />
                  <span className="text-xs text-gray-400 mb-2 block">
                    Between 1 and 24 hours
                  </span>

                  <label className="block text-sm text-gray-300 mb-1">
                    Popup Message
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value.slice(0, 150))}
                    maxLength={150}
                    rows={3}
                    className="w-full mb-2 p-2 rounded bg-[#22222a] text-white border border-[#2d2d36] focus:outline-none resize-none"
                    placeholder="Enter your update message (max 150 chars)"
                  />
                  <div className="text-xs text-gray-400 mb-4 text-right">
                    {message.length}/150
                  </div>

                  {/* Actions */}
                  <div className="flex gap-4">
                    <button
                      className="flex-1 py-2 rounded bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold"
                      onClick={handleAddUpdate}
                      disabled={!message || duration < 1 || duration > 24}
                    >
                      Add Update
                    </button>
                    <button
                      className="flex-1 py-2 rounded bg-[#22222a] text-gray-300 border border-[#2d2d36]"
                      onClick={() => setShowUpdatePopup(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </main>
        )}

        <MobileView
          logo={logo}
          profileTitle={profileTitle}
          bio={bio}
          links={links}
        />

        {showAddModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-black rounded-xl p-6 w-full max-w-md border border-[#2d2d36]">
              <h2 className="text-xl font-bold text-white mb-6">
                Add New Link
              </h2>
              <select
                className="w-full p-3 mb-4 bg-[#121212] text-white rounded-lg border border-[#2d2d36]"
                value={newLink.platform}
                onChange={(e) =>
                  setNewLink({ ...newLink, platform: e.target.value })
                }
              >
                <option value="youtube">YouTube</option>
                <option value="instagram">Instagram</option>
                <option value="tiktok">TikTok</option>
                <option value="twitter">Twitter</option>
                <option value="github">Github</option>
                <option value="website">Website</option>
              </select>
              <input
                type="url"
                placeholder="https://"
                className="w-full p-3 mb-6 bg-[#121212] border-[#2d2d36] text-white rounded-lg border "
                value={newLink.url}
                onChange={(e) =>
                  setNewLink({ ...newLink, url: e.target.value })
                }
              />
              <div className="flex gap-3">
                <button
                  onClick={handleAddLink}
                  className="flex-1 bg-gradient-to-r from-blue-600/80 to-purple-500/80 shadow text-white py-3 rounded-lg font-semibold "
                >
                  Add Link
                </button>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 bg-[#121212] text-gray-400 py-3 rounded-lg hover:bg-[#1a1a1f]"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileMenuPopup({
  onEditImage,
  onEditNameBio,
  onClose,
  anchorRef,
}: {
  onEditImage: () => void;
  onEditNameBio: () => void;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement>;
}) {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent): void {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target as Node) &&
        (!anchorRef ||
          !anchorRef.current ||
          !anchorRef.current.contains(e.target as Node))
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose, anchorRef]);

  return (
    <div
      ref={popupRef}
      className="absolute right-0 -mt-102 w-72 bg-[#1a1a1f] rounded-2xl shadow-xl z-50 py-2"
      style={{ minWidth: 260 }}
    >
      <button
        className="flex items-center w-full px-5 py-3 text-white hover:bg-gray-100 hover:text-black hover:rounded-md text-base font-medium transition"
        onClick={onEditImage}
      >
        Edit Image
      </button>
      <button
        className="flex items-center w-full px-5 py-3 text-white hover:bg-gray-100 hover:text-black hover:rounded-md text-base font-medium transition"
        onClick={onEditNameBio}
      >
        Edit display bio
      </button>
    </div>
  );
}
