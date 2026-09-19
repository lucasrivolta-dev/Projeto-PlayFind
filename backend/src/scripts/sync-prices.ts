async function main() {
  console.log(
    'Sync multi-store inativo por decisão de produto. Somente preços Steam estão ativos.',
  );
}

main().catch(() => {
  console.error(
    'Sync de preços falhou. Confira argumentos, configuração e disponibilidade; segredos omitidos.',
  );
  process.exitCode = 1;
});
