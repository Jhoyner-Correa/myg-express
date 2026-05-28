import { pool } from '../../config/database';
import { readdir, rm, stat } from 'fs/promises';
import path from 'path';
import whatsappMediaStorage from '../whatsapp/media/whatsappMediaStorage';
import whatsappService from '../whatsapp/whatsappService';

type CleanupStats = {
  jobsRemoved: number;
  logsRemoved: number;
  sessionsRemoved: number;
  mediaFilesRemoved: number;
  authDirsRemoved: number;
};

type CleanupSnapshot = CleanupStats & {
  lastRunAt: string | null;
  lastStatus: 'idle' | 'running' | 'ok' | 'error';
  lastError: string | null;
};

class DatabaseCleanupService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastSnapshot: CleanupSnapshot = {
    jobsRemoved: 0,
    logsRemoved: 0,
    sessionsRemoved: 0,
    mediaFilesRemoved: 0,
    authDirsRemoved: 0,
    lastRunAt: null,
    lastStatus: 'idle',
    lastError: null
  };
  private readonly enabled = String(process.env.DB_CLEANUP_ENABLED || 'true').toLowerCase() !== 'false';
  private readonly intervalMs = Number(process.env.DB_CLEANUP_INTERVAL_MS || 3600000);
  private readonly jobsRetentionDays = Number(process.env.WHATSAPP_JOBS_RETENTION_DAYS || 3);
  private readonly logsRetentionDays = Number(process.env.WHATSAPP_LOG_RETENTION_DAYS || 30);
  private readonly sessionsRetentionDays = Number(process.env.WHATSAPP_SESSION_RETENTION_DAYS || 30);
  private readonly mediaRetentionDays = Number(process.env.WHATSAPP_MEDIA_RETENTION_DAYS || 14);

  start() {
    if (!this.enabled || this.timer) return;

    this.timer = setInterval(() => {
      void this.runCleanup();
    }, this.intervalMs);

    void this.runCleanup();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getSnapshot() {
    return {
      enabled: this.enabled,
      intervalMs: this.intervalMs,
      retentionDays: {
        jobs: this.jobsRetentionDays,
        logs: this.logsRetentionDays,
        sessions: this.sessionsRetentionDays
      },
      ...this.lastSnapshot
    };
  }

  async runCleanup(): Promise<CleanupStats> {
    if (this.running) {
      return {
        jobsRemoved: 0,
        logsRemoved: 0,
        sessionsRemoved: 0,
        mediaFilesRemoved: 0,
        authDirsRemoved: 0
      };
    }

    this.running = true;
    this.lastSnapshot.lastStatus = 'running';
    this.lastSnapshot.lastError = null;

    try {
      const jobsRemoved = await this.cleanupOldJobs();
      const logsRemoved = await this.cleanupOldLogs();
      const sessionsRemoved = await this.cleanupOldInactiveSessions();
      const mediaFilesRemoved = await this.cleanupUnusedMediaFiles();
      const authDirsRemoved = await whatsappService.cleanupStaleAuthData(this.sessionsRetentionDays);

      if (jobsRemoved || logsRemoved || sessionsRemoved || mediaFilesRemoved || authDirsRemoved) {
        console.log(
          `[cleanup] jobs=${jobsRemoved} logs=${logsRemoved} sesiones=${sessionsRemoved} media=${mediaFilesRemoved} auth=${authDirsRemoved}`
        );
      }

      this.lastSnapshot = {
        jobsRemoved,
        logsRemoved,
        sessionsRemoved,
        mediaFilesRemoved,
        authDirsRemoved,
        lastRunAt: new Date().toISOString(),
        lastStatus: 'ok',
        lastError: null
      };

      return { jobsRemoved, logsRemoved, sessionsRemoved, mediaFilesRemoved, authDirsRemoved };
    } catch (error) {
      console.error('Error en limpieza automatica de base de datos:', error);
      this.lastSnapshot = {
        ...this.lastSnapshot,
        lastRunAt: new Date().toISOString(),
        lastStatus: 'error',
        lastError: error instanceof Error ? error.message : String(error)
      };
      return {
        jobsRemoved: 0,
        logsRemoved: 0,
        sessionsRemoved: 0,
        mediaFilesRemoved: 0,
        authDirsRemoved: 0
      };
    } finally {
      this.running = false;
    }
  }

  private async cleanupOldJobs(): Promise<number> {
    // La tabla whatsapp_jobs fue reemplazada por Redis/BullMQ, que maneja su propia retención.
    return 0;
  }

  private async cleanupOldLogs(): Promise<number> {
    const [result]: any = await pool.query(
      `DELETE FROM mensajes_log
       WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [this.logsRetentionDays]
    );

    return Number(result?.affectedRows || 0);
  }

  private async cleanupOldInactiveSessions(): Promise<number> {
    const [result]: any = await pool.query(
      `DELETE ws
       FROM whatsapp_sesiones ws
       LEFT JOIN avisos_diarios ad ON ad.whatsapp_sesion_id = ws.id
       LEFT JOIN mensajes_log ml ON ml.whatsapp_sesion_id = ws.id
       WHERE ws.activo = 0
         AND ws.estado IN ('disconnected', 'auth_failure', 'blocked', 'inactive')
         AND ws.updated_at < DATE_SUB(NOW(), INTERVAL ? DAY)
         AND ad.id IS NULL
         AND ml.id IS NULL`,
      [this.sessionsRetentionDays]
    );

    return Number(result?.affectedRows || 0);
  }

  private async collectReferencedMediaPaths(): Promise<Set<string>> {
    const referenced = new Set<string>();

    const [plantillaRows]: any = await pool.query(
      `SELECT imagen_path
       FROM plantillas
       WHERE imagen_path IS NOT NULL
         AND imagen_path <> ''`
    );

    for (const row of plantillaRows || []) {
      const mediaPath = String(row.imagen_path || '').trim();
      if (mediaPath) {
        referenced.add(path.resolve(mediaPath));
      }
    }

    // Los jobs ahora están en BullMQ, así que no buscamos ahí.
    // Solo retenemos si está en plantillas.
    return referenced;
  }

  private async cleanupUnusedMediaFiles(): Promise<number> {
    const baseDir = path.resolve(__dirname, '../../../storage/whatsapp-media');
    const referenced = await this.collectReferencedMediaPaths();
    const cutoffMs = Date.now() - Math.max(0, this.mediaRetentionDays) * 24 * 60 * 60 * 1000;
    let removed = 0;

    const walk = async (currentDir: string): Promise<void> => {
      const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => []);

      for (const entry of entries) {
        const target = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          await walk(target);
          const remaining = await readdir(target).catch(() => []);
          if (!remaining.length) {
            await rm(target, { recursive: true, force: true }).catch(() => undefined);
          }
          continue;
        }

        const absolutePath = path.resolve(target);
        if (referenced.has(absolutePath)) {
          continue;
        }

        const fileStats = await stat(absolutePath).catch(() => null);
        if (!fileStats) {
          continue;
        }

        if (fileStats.mtimeMs >= cutoffMs) {
          continue;
        }

        await rm(absolutePath, { force: true });
        removed += 1;
      }
    };

    await walk(baseDir).catch(() => undefined);
    return removed;
  }
}

export default new DatabaseCleanupService();
