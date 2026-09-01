import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool, runInTransaction } from '../core/database/database';
import {
  normalizeMobileChannel,
  normalizeMobileVersion,
  parseMobileBuild,
} from '../modules/rrhh-mobile/mobileVersionPolicy';

type LatestReleaseRow = RowDataPacket & {
  build_number: number;
};

function readArgument(name: string, required = true): string | null {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find(argument => argument.startsWith(prefix))?.slice(prefix.length).trim();
  if (!value && required) throw new Error(`Falta el argumento --${name}=...`);
  return value || null;
}

function parseMinimumBuild(value: string, latestBuild: number): number {
  const minimum = parseMobileBuild(value);
  if (minimum > latestBuild) {
    throw new Error('La compilacion minima soportada no puede superar la compilacion publicada.');
  }
  return minimum;
}

function parseHttpsUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('La URL de descarga debe usar HTTPS.');
  return url.toString();
}

async function main(): Promise<void> {
  const versionName = normalizeMobileVersion(readArgument('version'));
  const buildNumber = parseMobileBuild(readArgument('build'));
  const channel = normalizeMobileChannel(readArgument('channel', false) ?? 'PRODUCTION');
  const minimumSupportedBuild = parseMinimumBuild(readArgument('minimum-build') ?? '', buildNumber);
  const downloadUrl = parseHttpsUrl(readArgument('download-url') ?? '');
  const releaseNotes = readArgument('notes') ?? '';
  const checksum = readArgument('sha256')?.toLowerCase() ?? '';

  if (releaseNotes.length < 5 || releaseNotes.length > 5000) {
    throw new Error('Las notas de version deben contener entre 5 y 5000 caracteres.');
  }
  if (!/^[a-f0-9]{64}$/.test(checksum)) {
    throw new Error('El SHA-256 debe contener exactamente 64 caracteres hexadecimales.');
  }

  const releaseId = await runInTransaction(async connection => {
    const [latestRows] = await connection.query<LatestReleaseRow[]>(
      `SELECT build_number
         FROM mobile_app_releases
        WHERE plataforma = 'ANDROID' AND canal = ?
        ORDER BY build_number DESC
        LIMIT 1
        FOR UPDATE`,
      [channel],
    );
    const previousBuild = Number(latestRows[0]?.build_number ?? 0);
    if (buildNumber <= previousBuild) {
      throw new Error(`La compilacion debe ser mayor que ${previousBuild} para el canal ${channel}.`);
    }

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO mobile_app_releases (
         plataforma, canal, version_name, build_number, minimum_supported_build,
         estado, download_url, release_notes, checksum_sha256, publicado_en
       ) VALUES ('ANDROID', ?, ?, ?, ?, 'PUBLISHED', ?, ?, ?, CURRENT_TIMESTAMP)`,
      [channel, versionName, buildNumber, minimumSupportedBuild, downloadUrl, releaseNotes, checksum],
    );
    return result.insertId;
  });

  console.log(
    `Version movil publicada: id=${releaseId}, ${versionName}+${buildNumber}, ` +
      `canal=${channel}, minimo=${minimumSupportedBuild}.`,
  );
}

void main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => pool.end());
