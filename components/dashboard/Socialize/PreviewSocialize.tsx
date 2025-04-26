import { Plus } from "lucide-react";
import { getPlatformIcon } from "./SocializeIcons";
import Image from "next/image";
import Link from "next/link";

interface SocializePreviewProps {
  logo: string | null;
  profileTitle: string;
  bio: string;
  links: { url: string; platform: string }[];
}

export function SocializePreview({
  logo,
  profileTitle,
  bio,
  links,
}: SocializePreviewProps) {
  return (
    <section className="relative w-full max-w-[500px] h-[40rem] p-8 hidden md:block mx-auto">
      <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 bg-[#13131a] rounded-3xl p-4 border-[#2d2d36] border-2 flex flex-col items-center shadow-xl overflow-hidden">
        <div className="w-[300px] h-[580px] bg-[#0e1117] rounded-2xl overflow-hidden relative flex flex-col justify-center items-center z-10">
          <div className="mx-auto mt-3 mb-6" />

          {/* Profile header */}
          <div className="flex flex-col items-center mb-6 w-full px-4">
            <div className="w-full bg-[#1a1a1f]/40 backdrop-blur-md rounded-xl mb-4 p-2 border border-[#2a2a35] shadow-lg">
              <div className="flex flex-row items-center justify-center gap-5">
                <div className="min-w-16 h-16 rounded-full mb-4 flex items-center justify-center bg-gray-700 overflow-hidden border-4 border-[#0e6b9c] shadow-lg">
                  {logo && (
                    <Image
                      src={logo}
                      width={64}
                      height={64}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="flex flex-col w-full text-end">
                  <h2 className="text-white font-bold text-base flex items-center">
                    {profileTitle ? `@${profileTitle}` : ""}
                  </h2>
                  <p className="text-gray-300 text-start mt-2 text-xs">
                    {bio || "This is your bio. Tell the world about yourself!"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Links section */}
          <div className="flex-1 overflow-y-auto px-4 space-y-3 w-full z-10 pb-16">
            {links.length === 0 ? (
              <div className="text-center text-gray-400 mt-12 bg-[#1a1a1f]/40 backdrop-blur-md rounded-xl p-6 border border-[#2a2a35]">
                <div className="w-16 h-16 bg-[#0e6b9c]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Plus className="w-8 h-8 text-blue-400" />
                </div>
                <p>No links added yet</p>
              </div>
            ) : (
              links.map((link, index) => (
                <Link
                  key={index}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-[#1a1a1f]/60 hover:bg-[#23232a]/80 py-3 px-4 rounded-xl flex items-center gap-3 transition-all backdrop-blur-sm border border-[#2a2a35] transform hover:translate-y-[-1px] hover:shadow-md"
                >
                  <div className="w-10 h-10 rounded-full bg-[#23232a] flex items-center justify-center">
                    {getPlatformIcon(link.platform)}
                  </div>
                  <div className="flex-1">
                    <span className="text-white font-medium text-sm">
                      {link.platform}
                    </span>
                    <p className="text-[10px] text-gray-400 truncate">
                      {link.url}
                    </p>
                  </div>
                  <div className="text-gray-400">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M14 5l7 7m0 0l-7 7m7-7H3"
                      />
                    </svg>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
