import { Module } from '@nestjs/common';
import { ProfilePhotoController } from './profile-photo.controller';
import { ProfilePhotoService } from './profile-photo.service';

/** Per-user profile photos, stored in the database (user_profile_photos). */
@Module({
  controllers: [ProfilePhotoController],
  providers: [ProfilePhotoService],
})
export class ProfilePhotoModule {}
