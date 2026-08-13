import { renderAppIcon } from "@/lib/app-preview-art";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const { appId } = await params;
  return renderAppIcon(appId);
}
