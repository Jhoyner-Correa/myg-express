import { Request, Response } from 'express';
import { MobileVersionService } from './mobileVersion.service';

export class MobileVersionController {
  constructor(private readonly service = new MobileVersionService()) {}

  policy = async (req: Request, res: Response) => {
    try {
      const policy = await this.service.resolvePolicy({
        version: req.header('x-app-version') ?? req.query.version,
        build: req.header('x-app-build') ?? req.query.build,
        channel: req.header('x-app-channel') ?? req.query.channel,
      });
      res.setHeader('Cache-Control', 'private, max-age=300');
      return res.json({
        ok: true,
        data: {
          platform: policy.platform,
          channel: policy.channel,
          current_version: policy.currentVersion,
          current_build: policy.currentBuild,
          latest_version: policy.latestVersion,
          latest_build: policy.latestBuild,
          minimum_supported_build: policy.minimumSupportedBuild,
          update_available: policy.updateAvailable,
          update_required: policy.updateRequired,
          download_url: policy.downloadUrl,
          release_notes: policy.releaseNotes,
          published_at: policy.publishedAt,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo validar la version.';
      const unavailable = message.startsWith('No existe una version publicada');
      return res.status(unavailable ? 503 : 422).json({
        ok: false,
        code: unavailable ? 'VERSION_POLICY_UNAVAILABLE' : 'INVALID_APP_VERSION',
        message,
      });
    }
  };
}
