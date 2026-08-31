import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../../core/database/database';
import {
  buildMobileVersionPolicy,
  MobilePlatform,
  MobileReleaseChannel,
  normalizeMobileChannel,
  normalizeMobileVersion,
  parseMobileBuild,
} from './mobileVersionPolicy';

type MobileReleaseRow = RowDataPacket & {
  version_name: string;
  build_number: number;
  minimum_supported_build: number;
  download_url: string | null;
  release_notes: string | null;
  publicado_en: Date;
};

export class MobileVersionService {
  async resolvePolicy(input: { version: unknown; build: unknown; channel?: unknown }) {
    const platform: MobilePlatform = 'ANDROID';
    const channel: MobileReleaseChannel = normalizeMobileChannel(input.channel);
    const currentVersion = normalizeMobileVersion(input.version);
    const currentBuild = parseMobileBuild(input.build);
    const [rows] = await pool.query<MobileReleaseRow[]>(
      `SELECT version_name, build_number, minimum_supported_build,
              download_url, release_notes, publicado_en
         FROM mobile_app_releases
        WHERE plataforma = ? AND canal = ? AND estado = 'PUBLISHED'
        ORDER BY build_number DESC LIMIT 1`,
      [platform, channel],
    );
    if (!rows.length) throw new Error('No existe una version publicada para este canal.');
    const release = rows[0];
    return buildMobileVersionPolicy({
      platform,
      channel,
      currentVersion,
      currentBuild,
      release: {
        versionName: release.version_name,
        buildNumber: Number(release.build_number),
        minimumSupportedBuild: Number(release.minimum_supported_build),
        downloadUrl: release.download_url,
        releaseNotes: release.release_notes,
        publishedAt: release.publicado_en,
      },
    });
  }
}
