import { Injectable } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';

/**
 * Password hashing, isolated so the algorithm and its parameters can be
 * changed in one place.
 *
 * Argon2id with OWASP-recommended parameters (19 MiB memory, 2 iterations,
 * 1 degree of parallelism). The salt is generated per hash and embedded in the
 * encoded output, so no separate salt column is needed.
 */
@Injectable()
export class PasswordService {
  private readonly options = {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  };

  async hash(plaintext: string): Promise<string> {
    return hash(plaintext, this.options);
  }

  /**
   * Returns false instead of throwing on a malformed stored hash, so a corrupt
   * row results in a failed login rather than a 500 that reveals the problem.
   */
  async verify(storedHash: string, plaintext: string): Promise<boolean> {
    try {
      return await verify(storedHash, plaintext);
    } catch {
      return false;
    }
  }
}
