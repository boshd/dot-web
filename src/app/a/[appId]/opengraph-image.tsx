import { renderAppOpenGraphImage } from "@/lib/app-preview-art";

export const alt = "Dot app";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const { appId } = await params;
  return renderAppOpenGraphImage(appId);
}
