import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export interface VerifiedIdentity {
  uid: string;
}

export interface TokenVerifier {
  verify(token: string): Promise<VerifiedIdentity>;
}

/** Firebase Admin verifier. Credentials are read only from environment. */
export class FirebaseTokenVerifier implements TokenVerifier {
  private readonly app: unknown;

  constructor() {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('FIREBASE_ADMIN_NOT_CONFIGURED');
    }
    type AdminAppModule = {
      getApps(): unknown[];
      initializeApp(options: { credential: unknown }): unknown;
      cert(options: { projectId: string; clientEmail: string; privateKey: string }): unknown;
    };
    let adminApp: AdminAppModule;
    try {
      adminApp = require('firebase-admin/app') as AdminAppModule;
    } catch {
      throw new Error('FIREBASE_ADMIN_DEPENDENCY_MISSING');
    }
    this.app = adminApp.getApps()[0] ?? adminApp.initializeApp({
      credential: adminApp.cert({ projectId, clientEmail, privateKey }),
    });
  }

  async verify(token: string): Promise<VerifiedIdentity> {
    const adminAuth = require('firebase-admin/auth') as {
      getAuth(app: unknown): { verifyIdToken(value: string): Promise<{ uid: string }> };
    };
    const decoded = await adminAuth.getAuth(this.app).verifyIdToken(token);
    return { uid: decoded.uid };
  }
}
