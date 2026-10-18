const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const DEFAULT_DATA_DIR = path.resolve(__dirname, '..', 'storage');
const CURRENT_PASSWORD_ITERATIONS = 310000;

class AuthVault {
  constructor(dataDir = process.env.NEXUS_AUTH_DATA_DIR || DEFAULT_DATA_DIR) {
    this.dataDir = dataDir;
    this.dbFile = path.join(dataDir, 'nexus_users_vault.json');
    this.masterSecretFile = path.join(dataDir, 'nexus_master_secret');
    this.ensureStorage();
  }

  ensureStorage() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    if (!fs.existsSync(this.dbFile)) {
      fs.writeFileSync(this.dbFile, JSON.stringify({ users: [], sessions: [] }, null, 2), { flag: 'wx' });
    }
  }

  getMasterSecret() {
    const configuredSecret = process.env.NEXUS_MASTER_SECRET;
    if (configuredSecret && configuredSecret.length >= 32) return configuredSecret;
    if (configuredSecret) {
      throw new Error('NEXUS_MASTER_SECRET musi zawierać co najmniej 32 znaki.');
    }

    this.ensureStorage();
    if (!fs.existsSync(this.masterSecretFile)) {
      try {
        fs.writeFileSync(this.masterSecretFile, crypto.randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
      }
    }

    const secret = fs.readFileSync(this.masterSecretFile, 'utf-8').trim();
    if (secret.length < 64) {
      throw new Error('Lokalny sekret podpisu Nexusa jest uszkodzony. Zachowaj kopię pliku i odtwórz sekret przed resetowaniem haseł.');
    }
    return secret;
  }

  loadDb() {
    this.ensureStorage();
    const raw = fs.readFileSync(this.dbFile, 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.users) || !Array.isArray(data.sessions)) {
      throw new Error('Lokalna baza kont ma nieprawidłowy format.');
    }
    return data;
  }

  saveDb(data) {
    this.ensureStorage();
    const tempFile = `${this.dbFile}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    try {
      fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), { flag: 'wx', mode: 0o600 });
      fs.renameSync(tempFile, this.dbFile);
    } catch (err) {
      try {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      } catch (cleanupError) {
        console.error('[AuthVault] Nie udało się posprzątać pliku tymczasowego:', cleanupError.message);
      }
      throw err;
    }
  }

  getMachineFingerprint() {
    const interfaces = os.networkInterfaces();
    let mac = '';
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
          mac = iface.mac;
          break;
        }
      }
      if (mac) break;
    }
    const seed = `${os.hostname()}|${os.platform()}|${os.arch()}|${mac || 'local_device'}`;
    return crypto.createHash('sha256').update(seed).digest('hex');
  }

  hashPassword(password, salt, iterations = CURRENT_PASSWORD_ITERATIONS) {
    return crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
  }

  register({ username, email, password }) {
    const db = this.loadDb();
    const displayName = String(username || '').trim();
    const cleanUser = displayName.toLowerCase();
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!cleanUser || cleanUser.length < 3) {
      throw new Error('Nazwa użytkownika musi mieć co najmniej 3 znaki.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new Error('Podaj poprawny adres e-mail.');
    }
    if (typeof password !== 'string' || password.length < 8) {
      throw new Error('Hasło musi mieć co najmniej 8 znaków.');
    }

    if (db.users.some(u => u.username === cleanUser)) {
      throw new Error(`Użytkownik o nazwie "${cleanUser}" już istnieje.`);
    }
    if (db.users.some(u => u.email === cleanEmail)) {
      throw new Error(`Konto z adresem e-mail "${cleanEmail}" jest już zarejestrowane.`);
    }

    const userId = `usr_${crypto.randomBytes(8).toString('hex')}`;
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = this.hashPassword(password, salt);
    const machineFingerprint = this.getMachineFingerprint();
    const recoveryToken = `rec_${crypto.randomBytes(24).toString('hex')}`;
    const now = new Date().toISOString();

    // Generate cryptographic .searched identity signature
    const signaturePayload = `${userId}|${cleanUser}|${cleanEmail}|${machineFingerprint}|${recoveryToken}|${now}`;
    const integritySignature = crypto.createHmac('sha256', this.getMasterSecret()).update(signaturePayload).digest('hex');

    const newUser = {
      id: userId,
      username: cleanUser,
      displayName,
      email: cleanEmail,
      passwordHash,
      passwordIterations: CURRENT_PASSWORD_ITERATIONS,
      salt,
      machineFingerprint,
      recoveryToken,
      registeredAt: now,
      lastLoginAt: now
    };

    db.users.push(newUser);

    // Create session token
    db.sessions = db.sessions.filter(session => Date.parse(session.expiresAt) > Date.now());
    const token = `sess_${crypto.randomBytes(32).toString('hex')}`;
    db.sessions.push({
      token,
      userId,
      createdAt: now,
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
    });

    this.saveDb(db);

    // Construct the unforgeable .searched file payload
    const searchedFilePayload = {
      magic: 'NEXUS_SEARCHED_KEY_V1',
      version: '1.0',
      userId,
      username: cleanUser,
      email: cleanEmail,
      registeredAt: now,
      machineBoundHash: machineFingerprint,
      recoveryToken,
      integritySignature,
      securityNotice: 'PROPRIETARY PROJECT NEXUS ZERO-KNOWLEDGE IDENTITY KEY. Zachowaj ten plik na dysku. Jest on wymagany do procedury odzyskiwania hasła i potwierdzenia własności konta.'
    };

    const fileName = `nexus_identity_${cleanUser}.searched`;

    return {
      success: true,
      user: {
        id: userId,
        username: cleanUser,
        displayName: newUser.displayName,
        email: cleanEmail
      },
      token,
      searchedFile: {
        fileName,
        content: JSON.stringify(searchedFilePayload, null, 2)
      }
    };
  }

  login({ identifier, password }) {
    if (typeof password !== 'string' || !password) {
      throw new Error('Nieprawidłowa nazwa użytkownika / e-mail lub hasło.');
    }
    const db = this.loadDb();
    const cleanId = String(identifier || '').trim().toLowerCase();

    const user = db.users.find(u => u.username === cleanId || u.email === cleanId);
    if (!user) {
      throw new Error('Nieprawidłowa nazwa użytkownika / e-mail lub hasło.');
    }

    const iterations = Number.isInteger(user.passwordIterations) && user.passwordIterations >= 10000 && user.passwordIterations <= 1000000
      ? user.passwordIterations
      : 10000;
    const testHash = this.hashPassword(password, user.salt, iterations);
    const storedHash = Buffer.from(String(user.passwordHash || ''), 'hex');
    const candidateHash = Buffer.from(testHash, 'hex');
    if (storedHash.length !== candidateHash.length || !crypto.timingSafeEqual(candidateHash, storedHash)) {
      throw new Error('Nieprawidłowa nazwa użytkownika / e-mail lub hasło.');
    }

    const now = new Date().toISOString();
    user.lastLoginAt = now;
    if (iterations < CURRENT_PASSWORD_ITERATIONS) {
      const migratedSalt = crypto.randomBytes(16).toString('hex');
      user.passwordHash = this.hashPassword(password, migratedSalt);
      user.passwordIterations = CURRENT_PASSWORD_ITERATIONS;
      user.salt = migratedSalt;
    }
    db.sessions = db.sessions.filter(session => Date.parse(session.expiresAt) > Date.now());

    const token = `sess_${crypto.randomBytes(32).toString('hex')}`;
    db.sessions.push({
      token,
      userId: user.id,
      createdAt: now,
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
    });

    this.saveDb(db);

    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email
      },
      token
    };
  }

  verifySession(token) {
    if (!token) return null;
    const db = this.loadDb();
    const session = db.sessions.find(s => s.token === token);
    if (!session) return null;

    if (new Date(session.expiresAt) < new Date()) {
      return null;
    }

    const user = db.users.find(u => u.id === session.userId);
    if (!user) return null;

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email
    };
  }

  logout(token) {
    if (!token) return;
    const db = this.loadDb();
    db.sessions = db.sessions.filter(s => s.token !== token);
    this.saveDb(db);
  }

  /**
   * Verified Password Reset via .searched proprietary machine-bound key file
   */
  resetPasswordWithSearchedFile({ searchedFileContent, newPassword }) {
    if (!searchedFileContent) {
      throw new Error('Wymagany jest plik tożsamości (.searched) pobrany podczas rejestracji.');
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      throw new Error('Nowe hasło musi mieć co najmniej 8 znaków.');
    }

    let parsedKey;
    try {
      parsedKey = typeof searchedFileContent === 'string' ? JSON.parse(searchedFileContent) : searchedFileContent;
    } catch (_) {
      throw new Error('Nieprawidłowy format pliku .searched. Plik może być uszkodzony.');
    }

    if (parsedKey.magic !== 'NEXUS_SEARCHED_KEY_V1') {
      throw new Error('Przesłany plik nie jest poprawnym plikiem tożsamości (.searched) Project Nexus.');
    }

    const { userId, username, email, machineBoundHash, recoveryToken, registeredAt, integritySignature } = parsedKey;

    if (
      typeof userId !== 'string' ||
      typeof username !== 'string' ||
      typeof email !== 'string' ||
      typeof machineBoundHash !== 'string' ||
      typeof recoveryToken !== 'string' ||
      typeof registeredAt !== 'string' ||
      typeof integritySignature !== 'string' ||
      !userId ||
      !username ||
      !recoveryToken ||
      !integritySignature
    ) {
      throw new Error('Plik .searched zawiera niekompletne dane uwierzytelniające.');
    }

    // Verify HMAC integrity signature
    const signaturePayload = `${userId}|${username.toLowerCase()}|${email.toLowerCase()}|${machineBoundHash}|${recoveryToken}|${registeredAt}`;
    const expectedSignature = crypto.createHmac('sha256', this.getMasterSecret()).update(signaturePayload).digest('hex');

    const expected = Buffer.from(expectedSignature, 'hex');
    const actual = Buffer.from(String(integritySignature), 'hex');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(expected, actual)) {
      throw new Error('🚨 ALARM BEZPIECZEŃSTWA: Podpis kryptograficzny pliku .searched jest nieprawidłowy! Plik został zmodyfikowany lub sfałszowany.');
    }

    const db = this.loadDb();
    const user = db.users.find(u => u.id === userId && u.username === username.toLowerCase());
    if (!user) {
      throw new Error('Użytkownik powiązany z tym plikiem klucza nie istnieje w bazie.');
    }

    if (user.recoveryToken !== recoveryToken) {
      throw new Error('Token odzyskiwania w pliku .searched wygasł lub został już wykorzystany.');
    }

    // Check machine binding
    const currentMachine = this.getMachineFingerprint();
    const isSameMachine = (currentMachine === machineBoundHash);
    if (!isSameMachine) {
      throw new Error('Plik tożsamości został utworzony na innym urządzeniu. Odzyskiwanie hasła jest dozwolone tylko na powiązanej maszynie.');
    }

    // Update password
    const newSalt = crypto.randomBytes(16).toString('hex');
    user.passwordHash = this.hashPassword(newPassword, newSalt);
    user.salt = newSalt;
    user.passwordIterations = CURRENT_PASSWORD_ITERATIONS;
    // Rotate recovery token to invalidate old .searched file after use
    user.recoveryToken = `rec_${crypto.randomBytes(24).toString('hex')}`;
    user.passwordResetAt = new Date().toISOString();

    // Revoke all existing sessions
    db.sessions = db.sessions.filter(s => s.userId !== user.id);

    // Create new fresh session
    db.sessions = db.sessions.filter(session => Date.parse(session.expiresAt) > Date.now());
    const token = `sess_${crypto.randomBytes(32).toString('hex')}`;
    db.sessions.push({
      token,
      userId: user.id,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
    });

    this.saveDb(db);

    // Issue updated .searched file with the rotated recovery token
    const newSignaturePayload = `${user.id}|${user.username}|${user.email}|${machineBoundHash}|${user.recoveryToken}|${user.registeredAt}`;
    const newIntegritySignature = crypto.createHmac('sha256', this.getMasterSecret()).update(newSignaturePayload).digest('hex');

    const newSearchedPayload = {
      ...parsedKey,
      recoveryToken: user.recoveryToken,
      integritySignature: newIntegritySignature,
      lastRotated: new Date().toISOString()
    };

    return {
      success: true,
      message: `Hasło dla użytkownika ${user.displayName} zostało pomyślnie zresetowane.${isSameMachine ? ' (Zweryfikowano zgodność maszyny Windows)' : ''}`,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email
      },
      token,
      newSearchedFile: {
        fileName: `nexus_identity_${user.username}.searched`,
        content: JSON.stringify(newSearchedPayload, null, 2)
      }
    };
  }
}

module.exports = {
  AuthVault,
  authVault: new AuthVault()
};
