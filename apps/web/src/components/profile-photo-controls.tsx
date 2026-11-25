'use client';

import { useState } from 'react';
import { ProfilePhotoDialog } from './profile-photo-dialog';
import { UserAvatar } from './user-avatar';
import type { PhotoOwner } from '@/lib/profile-photo';

/**
 * Avatar plus a "Change photo" action that opens the crop dialog. Used on My
 * Account (owner "me") and, for administrators, on a user's profile (owner =
 * that user's id). Saving updates this avatar at once; the server refresh
 * updates every other place the photo appears.
 */
export function ProfilePhotoControls({
  owner,
  fullName,
  initialVersion,
  size = 'xl',
  canEdit = true,
}: {
  owner: PhotoOwner;
  fullName: string;
  initialVersion: string | null;
  size?: 'lg' | 'xl';
  canEdit?: boolean;
}) {
  const [version, setVersion] = useState<string | null>(initialVersion);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
      <UserAvatar owner={owner} fullName={fullName} version={version} size={size} ring />
      {canEdit && (
        <button type="button" onClick={() => setOpen(true)} className="btn-secondary h-9 px-4">
          Change photo
        </button>
      )}
      {canEdit && (
        <ProfilePhotoDialog
          owner={owner}
          fullName={fullName}
          currentVersion={version}
          open={open}
          onClose={() => setOpen(false)}
          onSaved={(next) => setVersion(next)}
        />
      )}
    </div>
  );
}
