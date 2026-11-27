import { Injectable } from '@nestjs/common';
import { BRANDING_SETTING_KEYS, SettingsService } from '../settings/settings.service';
import { normalizeEmail } from '../common/utils/normalize';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';

/** Public sign-in branding. Exposes only the support email. */
export interface LoginBranding {
  supportEmail: string | null;
}

/**
 * Sign-in page branding managed from Admin -> Appearance.
 *
 * Background images (login, sidebar, workspace) have been removed; only the
 * administrator contact address remains here.
 */
@Injectable()
export class BrandingService {
  constructor(private readonly settingsService: SettingsService) {}

  /** Public: the support email shown on the sign-in page. */
  async getLoginBranding(): Promise<LoginBranding> {
    const supportEmail = await this.settingsService.get<string | null>(BRANDING_SETTING_KEYS.SUPPORT_EMAIL);
    return { supportEmail: supportEmail ?? null };
  }

  async setSupportEmail(email: string | null | undefined, actor: AuthenticatedUser): Promise<LoginBranding> {
    await this.settingsService.set(BRANDING_SETTING_KEYS.SUPPORT_EMAIL, normalizeEmail(email) ?? null, actor);
    return this.getLoginBranding();
  }
}
