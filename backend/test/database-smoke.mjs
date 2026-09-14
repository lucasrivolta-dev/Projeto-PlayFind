import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

// Explicit opt-in command: all fixture writes are rolled back, including successful cases.
const db = new PrismaClient({ log: [] });
const rollback = new Error('ROLLBACK_TEST_FIXTURES');

async function verify(label, action, expectedCode) {
  let outcome;
  try {
    await db.$transaction(async (tx) => {
      await action(tx);
      throw rollback;
    });
  } catch (error) {
    outcome = error;
  }
  const passed =
    expectedCode instanceof RegExp
      ? expectedCode.test(String(outcome?.message))
      : expectedCode
        ? outcome?.code === expectedCode
        : outcome === rollback;
  if (!passed) throw new Error(label);
  console.log('OK: ' + label);
}

async function fixtures(tx) {
  const token = randomUUID();
  const user = await tx.user.create({
    data: { firebaseUid: 'test-' + token, username: 'test-' + token, name: 'Teste temporário' },
  });
  const game = await tx.game.create({ data: { title: 'Teste temporário', slug: token } });
  return { user, game };
}

try {
  const target = new URL(process.env.DATABASE_URL);
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
    target.pathname !== '/nextplay'
  ) {
    throw new Error('Este teste exige o banco nextplay local');
  }
  await verify('Usuário, jogo, biblioteca e comentário relacionados', async (tx) => {
    const { user, game } = await fixtures(tx);
    await tx.userGameLibrary.create({
      data: { userId: user.id, gameId: game.id, status: 'PLAYED', rating: 5 },
    });
    await tx.comment.create({ data: { userId: user.id, gameId: game.id, body: 'Teste' } });
    const stored = await tx.game.findUnique({
      where: { id: game.id },
      include: { library: true, comments: true },
    });
    if (stored.library.length !== 1 || stored.comments.length !== 1) throw new Error('Relações');
  });
  await verify(
    'Curtidas sem usuário ou jogo são recusadas',
    async (tx) => {
      await tx.userGameLibrary.create({
        data: { userId: randomUUID(), gameId: randomUUID(), liked: true },
      });
    },
    'P2003',
  );
  await verify(
    'Curtidas duplicadas são recusadas',
    async (tx) => {
      const { user, game } = await fixtures(tx);
      const data = { userId: user.id, gameId: game.id };
      await tx.userGameLibrary.create({ data: { ...data, liked: true } });
      await tx.userGameLibrary.create({ data: { ...data, liked: true } });
    },
    'P2002',
  );
  await verify(
    'Nota fora de 1 a 5 é recusada',
    async (tx) => {
      const { user, game } = await fixtures(tx);
      await tx.userGameLibrary.create({
        data: { userId: user.id, gameId: game.id, status: 'PLAYED', rating: 6 },
      });
    },
    /library_rating_range/,
  );
  await verify(
    'Seguir a si mesmo é recusado',
    async (tx) => {
      const { user } = await fixtures(tx);
      await tx.userFollow.create({ data: { followerId: user.id, followingId: user.id } });
    },
    /user_cannot_follow_self/,
  );
  console.log('Verificação concluída. Registros temporários revertidos.');
} catch {
  // Never print Prisma errors: they may contain connection details.
  console.error('Verificação do banco falhou. Detalhes privados omitidos.');
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
