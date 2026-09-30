import { storageKey } from "./network/identity";
import { colors } from "./shared";

export type Profile = { name: string; picture: string; color: string };
const profileKey = `${storageKey}-profile`;
const randomColor = () => colors[Math.floor(Math.random() * colors.length)];

export function loadProfile(): Profile {
  try {
    const saved = JSON.parse(localStorage.getItem(profileKey) || "null");
    if (saved && typeof saved.name === "string")
      return {
        name: saved.name.slice(0, 24),
        color: colors.includes(saved.color) ? saved.color : randomColor(),
        picture:
          typeof saved.picture === "string" &&
          saved.picture.length <= 3000 &&
          /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(saved.picture)
            ? saved.picture
            : "",
      };
  } catch {}
  return {
    name: localStorage.getItem("meeting-player-name") || "",
    picture: "",
    color: randomColor(),
  };
}

export function saveProfile(profile: Profile) {
  localStorage.setItem(profileKey, JSON.stringify(profile));
}

export async function preparePicture(file: File): Promise<string> {
  if (!file.type.startsWith("image/") || file.size > 10_000_000)
    throw Error("Choose an image smaller than 10 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(Error("This image could not be opened."));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw Error("Image editing is unavailable on this device.");
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const x = (image.naturalWidth - side) / 2;
    const y = (image.naturalHeight - side) / 2;
    for (const size of [96, 80, 64, 48]) {
      canvas.width = size;
      canvas.height = size;
      context.fillStyle = "#17283c";
      context.fillRect(0, 0, size, size);
      context.drawImage(image, x, y, side, side, 0, 0, size, size);
      for (const quality of [0.7, 0.5, 0.35]) {
        const picture = canvas.toDataURL("image/jpeg", quality);
        if (picture.length <= 3000) return picture;
      }
    }
    throw Error("This picture could not be made small enough. Try another.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
