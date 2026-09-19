import 'package:flutter/material.dart';
import '../../design_system/theme.dart';
import 'auth_controller.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key, required this.controller});
  final AuthController controller;
  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen>
    with SingleTickerProviderStateMixin {
  final form = GlobalKey<FormState>();
  final email = TextEditingController();
  final password = TextEditingController();
  late final AnimationController animation = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 900))
    ..repeat(reverse: true);
  bool create = false, busy = false, obscure = true;

  @override
  void dispose() {
    animation.dispose();
    email.dispose();
    password.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (!form.currentState!.validate()) return;
    setState(() => busy = true);
    final ok = await widget.controller
        .signIn(email: email.text, password: password.text, create: create);
    if (!mounted) return;
    setState(() => busy = false);
    if (ok) {
      if (create) {
        await _askPlatforms();
      }
      if (mounted) Navigator.pop(context, true);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(widget.controller.errorMessage ??
              'Confira seu e-mail e use pelo menos 6 caracteres na senha.')));
    }
  }

  Future<void> _askPlatforms() async {
    final selected = <String>{'pc'};
    final options = const [
      ('PC', 'pc'),
      ('PlayStation', 'playstation'),
      ('Xbox', 'xbox'),
      ('Switch', 'switch'),
      ('Mobile', 'mobile'),
    ];

    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.surface,
      isDismissible: false,
      enableDrag: false,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.hero)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: const EdgeInsets.all(AppSpacing.margin),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Em quais plataformas você joga?', style: AppTypography.title(18)),
              const SizedBox(height: AppSpacing.xs),
              Text(
                'Usamos suas preferências para priorizar ofertas e jogos compatíveis no seu feed.',
                style: AppTypography.body(13).copyWith(color: AppColors.secondary),
              ),
              const SizedBox(height: AppSpacing.md),
              Wrap(
                spacing: AppSpacing.xs,
                runSpacing: AppSpacing.xs,
                children: options.map((opt) {
                  final isSel = selected.contains(opt.$2);
                  return FilterChip(
                    label: Text(opt.$1),
                    selected: isSel,
                    selectedColor: AppColors.primary.withValues(alpha: 0.25),
                    checkmarkColor: AppColors.primary,
                    labelStyle: TextStyle(
                      color: isSel ? AppColors.primary : AppColors.text,
                      fontWeight: isSel ? FontWeight.w700 : FontWeight.w500,
                    ),
                    onSelected: (val) {
                      setSheetState(() {
                        if (val) {
                          selected.add(opt.$2);
                        } else {
                          selected.remove(opt.$2);
                        }
                      });
                    },
                  );
                }).toList(),
              ),
              const SizedBox(height: AppSpacing.lg),
              FilledButton(
                onPressed: () async {
                  await widget.controller.savePlatformPreferences(selected.toList());
                  if (ctx.mounted) Navigator.pop(ctx);
                },
                child: const Text('Continuar'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> provider(String value) async {
    setState(() => busy = true);
    final ok = await widget.controller.signInWithProvider(value);
    if (mounted && ok) {
      Navigator.pop(context, true);
    } else if (mounted) {
      setState(() => busy = false);
      final message = widget.controller.errorMessage;
      if (message != null) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      backgroundColor: AppColors.canvas,
      body: SafeArea(
          child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(AppSpacing.margin,
                  AppSpacing.xxl, AppSpacing.margin, AppSpacing.margin),
              child: Form(
                  key: form,
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        AnimatedBuilder(
                            animation: animation,
                            builder: (context, _) {
                              final scale = 1 + animation.value * .08;
                              return Transform.scale(
                                  scale: scale,
                                  child: Container(
                                      width: 76,
                                      height: 76,
                                      decoration: BoxDecoration(
                                          shape: BoxShape.circle,
                                          color: AppColors.primary
                                              .withValues(alpha: .18),
                                          boxShadow: [
                                            BoxShadow(
                                                color: AppColors.primary
                                                    .withValues(alpha: .25),
                                                blurRadius: 28)
                                          ]),
                                      child: const Icon(
                                          Icons.play_arrow_rounded,
                                          color: AppColors.primary,
                                          size: 48)));
                            }),
                        const SizedBox(height: AppSpacing.lg),
                        Text('Encontre seu próximo jogo.',
                            textAlign: TextAlign.center,
                            style: AppTypography.title(26)),
                        const SizedBox(height: AppSpacing.xs),
                        Text(
                            create
                                ? 'Crie sua conta para participar da comunidade.'
                                : 'Entre para salvar jogos, avaliar e conversar.',
                            textAlign: TextAlign.center,
                            style: AppTypography.body()),
                        const SizedBox(height: AppSpacing.lg),
                        Row(children: [
                          Expanded(
                              child: FilledButton(
                                  onPressed: busy
                                      ? null
                                      : () => setState(() => create = false),
                                  style: FilledButton.styleFrom(
                                      backgroundColor: create
                                          ? AppColors.high
                                          : AppColors.primary),
                                  child: const Text('Entrar'))),
                          const SizedBox(width: AppSpacing.xs),
                          Expanded(
                              child: FilledButton(
                                  onPressed: busy
                                      ? null
                                      : () => setState(() => create = true),
                                  style: FilledButton.styleFrom(
                                      backgroundColor: create
                                          ? AppColors.primary
                                          : AppColors.high),
                                  child: const Text('Criar conta')))
                        ]),
                        const SizedBox(height: AppSpacing.lg),
                        OutlinedButton.icon(
                            key: const ValueKey('auth-google'),
                            onPressed: busy ? null : () => provider('Google'),
                            icon: const Icon(Icons.g_mobiledata, size: 28),
                            label: const Text('Continuar com Google')),
                        const SizedBox(height: AppSpacing.sm),
                        OutlinedButton.icon(
                            onPressed: busy ? null : () => provider('Apple'),
                            icon: const Icon(Icons.apple),
                            label: const Text('Continuar com Apple')),
                        const SizedBox(height: AppSpacing.lg),
                        Row(children: [
                          const Expanded(
                              child: Divider(color: AppColors.border)),
                          Padding(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: AppSpacing.sm),
                              child: Text('ou use seu e-mail',
                                  style: AppTypography.body(12))),
                          const Expanded(
                              child: Divider(color: AppColors.border))
                        ]),
                        const SizedBox(height: AppSpacing.lg),
                        TextFormField(
                            controller: email,
                            keyboardType: TextInputType.emailAddress,
                            decoration: const InputDecoration(
                                labelText: 'E-mail',
                                prefixIcon: Icon(Icons.mail_outline)),
                            validator: (value) => (value ?? '').contains('@')
                                ? null
                                : 'Digite um e-mail válido.'),
                        const SizedBox(height: AppSpacing.md),
                        TextFormField(
                            controller: password,
                            obscureText: obscure,
                            decoration: InputDecoration(
                                labelText: 'Senha',
                                prefixIcon: const Icon(Icons.lock_outline),
                                suffixIcon: IconButton(
                                    tooltip: obscure
                                        ? 'Mostrar senha'
                                        : 'Ocultar senha',
                                    onPressed: () =>
                                        setState(() => obscure = !obscure),
                                    icon: Icon(obscure
                                        ? Icons.visibility_outlined
                                        : Icons.visibility_off_outlined))),
                            validator: (value) => (value ?? '').length >= 6
                                ? null
                                : 'Use pelo menos 6 caracteres.'),
                        const SizedBox(height: AppSpacing.lg),
                        FilledButton(
                            onPressed: busy ? null : submit,
                            child: Text(create
                                ? 'Criar minha conta'
                                : 'Entrar com e-mail')),
                        const SizedBox(height: AppSpacing.md),
                        TextButton(
                            onPressed: busy
                                ? null
                                : () => Navigator.pop(context, false),
                            child: const Text('Continuar como visitante')),
                        const SizedBox(height: AppSpacing.xs),
                        Text(
                            'Você poderá continuar explorando sem criar uma conta. O login só será necessário quando quiser interagir.',
                            textAlign: TextAlign.center,
                            style: AppTypography.body(11)),
                      ])))));
}
