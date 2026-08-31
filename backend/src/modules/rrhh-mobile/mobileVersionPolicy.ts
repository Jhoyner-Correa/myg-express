export type MobileReleaseChannel = 'PRODUCTION' | 'BETA' | 'INTERNAL';
export type MobilePlatform = 'ANDROID';

export type PublishedMobileRelease = {
  versionName: string;
  buildNumber: number;
  minimumSupportedBuild: number;
  downloadUrl: string | null;
  releaseNotes: string | null;
  publishedAt: Date;
};

export type MobileVersionPolicy = {
  platform: MobilePlatform;
  channel: MobileReleaseChannel;
  currentVersion: string;
  currentBuild: number;
  latestVersion: string;
  latestBuild: number;
  minimumSupportedBuild: number;
  updateAvailable: boolean;
  updateRequired: boolean;
  downloadUrl: string | null;
  releaseNotes: string | null;
  publishedAt: Date;
};

export function parseMobileBuild(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error('El numero de compilacion no es valido.');
  }
  return parsed;
}

export function normalizeMobileVersion(value: unknown): string {
  const normalized = String(value ?? '').trim();
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(normalized)) {
    throw new Error('La version de la aplicacion no es valida.');
  }
  return normalized;
}

export function normalizeMobileChannel(value: unknown): MobileReleaseChannel {
  const normalized = String(value ?? 'PRODUCTION').trim().toUpperCase();
  if (normalized === 'PRODUCTION' || normalized === 'BETA' || normalized === 'INTERNAL') return normalized;
  throw new Error('El canal de distribucion no es valido.');
}

export function buildMobileVersionPolicy(input: {
  platform: MobilePlatform;
  channel: MobileReleaseChannel;
  currentVersion: string;
  currentBuild: number;
  release: PublishedMobileRelease;
}): MobileVersionPolicy {
  const { release } = input;
  return {
    platform: input.platform,
    channel: input.channel,
    currentVersion: input.currentVersion,
    currentBuild: input.currentBuild,
    latestVersion: release.versionName,
    latestBuild: release.buildNumber,
    minimumSupportedBuild: release.minimumSupportedBuild,
    updateAvailable: input.currentBuild < release.buildNumber,
    updateRequired: input.currentBuild < release.minimumSupportedBuild,
    downloadUrl: release.downloadUrl,
    releaseNotes: release.releaseNotes,
    publishedAt: release.publishedAt,
  };
}
