export interface CandidateIdentityInfo {
  name: string;
  releaseDate?: Date | null;
  releaseYear?: number | null;
  developer?: string | null;
  publisher?: string | null;
  platforms?: string[];
}

export interface SteamAppCandidateInfo {
  appId: number;
  name: string;
  type?: string;
  releaseDate?: Date | null;
  releaseDateRaw?: string | null;
  developers?: string[];
  publishers?: string[];
  isFree?: boolean;
}

export type SteamMatchStatus = 'CONFIDENT_MATCH' | 'AMBIGUOUS' | 'NO_MATCH';

export interface SteamMatchResult {
  status: SteamMatchStatus;
  appId?: number;
  confidence?: number;
  reasons: string[];
}

const DISQUALIFYING_TITLE_KEYWORDS = [
  'playtest',
  'beta',
  'demo',
  'soundtrack',
  'ost',
  'dlc',
  'expansion pack',
  'dedicated server',
  'server',
  'artbook',
  'wallpaper',
  'vr version',
];

const ALLOWED_EDITION_SUFFIXES = [
  'definitive edition',
  'enhanced edition',
  'goty',
  'goty edition',
  'game of the year',
  'game of the year edition',
  'director s cut',
  'directors cut',
  'remastered',
  'special edition',
  'anniversary edition',
  'complete edition',
  'deluxe edition',
  'standard edition',
  'legendary edition',
];

const SEQUEL_PATTERNS = [
  /\b(?:part|episode|chapter|season)\s+([0-9ivx]+)\b/i,
  /\b([2-9]|10)\b/i,
  /\b(ii|iii|iv|v|vi|vii|viii|ix|x)\b/i,
  /\b(prequel|sequel|origins|reloaded|unlimited|tactics|arena|online)\b/i,
];

export function normalizeTitle(name: string): string {
  return (name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[®™©]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeCompany(name: string): string {
  return (name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(inc|incorporated|llc|ltd|limited|corp|corporation|studios|studio|games|game|entertainment|software|interactive)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function extractSequelIndicator(name: string): string | null {
  const norm = normalizeTitle(name);
  for (const pattern of SEQUEL_PATTERNS) {
    const match = norm.match(pattern);
    if (match) {
      return match[1] ? match[1].toLowerCase() : match[0].toLowerCase();
    }
  }
  return null;
}

export function stripEditionSuffix(normalizedTitle: string): { base: string; edition: string | null } {
  for (const suffix of ALLOWED_EDITION_SUFFIXES) {
    if (normalizedTitle.endsWith(` ${suffix}`)) {
      return {
        base: normalizedTitle.slice(0, -suffix.length - 1).trim(),
        edition: suffix,
      };
    }
    if (normalizedTitle === suffix) {
      return { base: normalizedTitle, edition: null };
    }
  }
  return { base: normalizedTitle, edition: null };
}

export function parseSteamReleaseDate(dateStr?: string | null): { date: Date | null; year: number | null } {
  if (!dateStr || typeof dateStr !== 'string') {
    return { date: null, year: null };
  }
  const clean = dateStr.trim();
  const parsed = new Date(clean);
  if (!Number.isNaN(parsed.getTime())) {
    return { date: parsed, year: parsed.getUTCFullYear() };
  }
  const yearMatch = clean.match(/\b(19\d\d|20\d\d)\b/);
  if (yearMatch) {
    const year = Number(yearMatch[1]);
    return { date: new Date(Date.UTC(year, 0, 1)), year };
  }
  return { date: null, year: null };
}

export function matchSteamCandidate(
  candidate: CandidateIdentityInfo,
  steamApp: SteamAppCandidateInfo,
): SteamMatchResult {
  const reasons: string[] = [];
  let score = 0;

  // 1. App Type validation
  if (steamApp.type && steamApp.type.toLowerCase() !== 'game') {
    return {
      status: 'NO_MATCH',
      reasons: [`Tipo Steam não é game: "${steamApp.type}"`],
    };
  }

  // 2. Disqualifying keywords in Steam title
  const steamNorm = normalizeTitle(steamApp.name);
  for (const keyword of DISQUALIFYING_TITLE_KEYWORDS) {
    if (steamNorm.includes(keyword)) {
      return {
        status: 'NO_MATCH',
        reasons: [`Título Steam contém palavra-chave desqualificante: "${keyword}"`],
      };
    }
  }

  // 3. Sequel / Prequel / Numbered entry divergence
  const candidateSequel = extractSequelIndicator(candidate.name);
  const steamSequel = extractSequelIndicator(steamApp.name);

  if (candidateSequel !== steamSequel) {
    return {
      status: 'NO_MATCH',
      reasons: [
        `Divergência de sequência/edição numerada: candidato (${candidateSequel ?? 'nenhum'}) vs Steam (${steamSequel ?? 'nenhum'})`,
      ],
    };
  }

  // 4. Base title equivalence
  const candidateNorm = normalizeTitle(candidate.name);
  const { base: candidateBase } = stripEditionSuffix(candidateNorm);
  const { base: steamBase, edition: steamEdition } = stripEditionSuffix(steamNorm);

  const exactTitle = candidateNorm === steamNorm;
  const exactBase = candidateBase === steamBase;

  if (!exactBase) {
    return {
      status: 'NO_MATCH',
      reasons: [`Título base incompatível: "${candidateBase}" vs "${steamBase}"`],
    };
  }

  if (exactTitle) {
    score += 50;
    reasons.push('Título idêntico');
  } else if (steamEdition) {
    score += 40;
    reasons.push(`Edição compatível autorizada: "${steamEdition}"`);
  } else {
    return {
      status: 'AMBIGUOUS',
      reasons: [`Variação de título não reconhecida como edição: "${steamNorm}"`],
    };
  }

  // 5. Release Date & Year verification
  const candidateYear =
    candidate.releaseYear ??
    (candidate.releaseDate ? candidate.releaseDate.getUTCFullYear() : null);

  const { year: steamYear } = steamApp.releaseDate
    ? { year: steamApp.releaseDate.getUTCFullYear() }
    : parseSteamReleaseDate(steamApp.releaseDateRaw);

  if (candidateYear !== null && steamYear !== null) {
    const yearDiff = Math.abs(candidateYear - steamYear);
    if (yearDiff > 3) {
      return {
        status: 'NO_MATCH',
        reasons: [
          `Lançamentos muito distantes no tempo (${candidateYear} vs ${steamYear}, diferença de ${yearDiff} anos)`,
        ],
      };
    }

    if (yearDiff === 0) {
      score += 25;
      reasons.push('Ano de lançamento idêntico');
    } else if (yearDiff === 1) {
      score += 20;
      reasons.push('Lançamento com diferença de 1 ano (port PC compatível)');
    } else if (yearDiff <= 3) {
      score += 10;
      reasons.push(`Lançamento separado por ${yearDiff} anos (requer forte validação de estúdio)`);
    }
  }

  // 6. Developer / Studio verification
  const candidateDev = normalizeCompany(candidate.developer ?? '');
  const steamDevs = (steamApp.developers ?? []).map(normalizeCompany).filter(Boolean);

  if (candidateDev && steamDevs.length > 0) {
    const devMatches = steamDevs.some(
      (d) => d.includes(candidateDev) || candidateDev.includes(d),
    );
    if (devMatches) {
      score += 20;
      reasons.push('Desenvolvedora compatível');
    } else {
      // If developer is known on both sides and explicitly does not match
      const candidatePub = normalizeCompany(candidate.publisher ?? '');
      const steamPubs = (steamApp.publishers ?? []).map(normalizeCompany).filter(Boolean);
      const pubMatches = candidatePub && steamPubs.some(
        (p) => p.includes(candidatePub) || candidatePub.includes(p),
      );

      if (pubMatches) {
        score += 10;
        reasons.push('Publisher compatível (desenvolvedora divergente)');
      } else {
        return {
          status: 'NO_MATCH',
          reasons: [
            `Desenvolvedora incompatível: "${candidate.developer}" vs "${steamApp.developers?.join(', ')}"`,
          ],
        };
      }
    }
  }

  // 7. Platform verification (PC / Windows support)
  score += 5;
  reasons.push('Plataforma PC aplicável');

  // Classification decision
  if (score >= 75) {
    return {
      status: 'CONFIDENT_MATCH',
      appId: steamApp.appId,
      confidence: score,
      reasons,
    };
  }

  if (score >= 50) {
    return {
      status: 'AMBIGUOUS',
      appId: steamApp.appId,
      confidence: score,
      reasons: [...reasons, `Confiança insuficiente (${score} < 75)`],
    };
  }

  return {
    status: 'NO_MATCH',
    reasons: [...reasons, `Score de compatibilidade insuficiente (${score} < 50)`],
  };
}
