import 'package:flutter/material.dart';

abstract final class AppColors {
  static const canvas = Color(0xFF0B0E14);
  static const low = Color(0xFF12161F);
  static const surface = Color(0xFF161B22);
  static const high = Color(0xFF1F2633);
  static const primary = Color(0xFF8B5CF6);
  static const active = Color(0xFF7C3AED);
  static const positive = Color(0xFF10B981);
  static const text = Color(0xFFF9FAFB);
  static const secondary = Color(0xFF94A3B8);
  static const muted = Color(0xFF64748B);
  static const glass = Color(0xB8161B22);
  static const border = Color(0x14FFFFFF);
  static const transparent = Colors.transparent;
  static const error = Color(0xFFFFB4AB);
}

abstract final class AppSpacing {
  static const tiny = 2.0;
  static const xxs = 4.0;
  static const xs = 8.0;
  static const sm = 12.0;
  static const md = 16.0;
  static const margin = 20.0;
  static const lg = 24.0;
  static const xl = 32.0;
  static const xxl = 40.0;
  static const xxxl = 48.0;
}

abstract final class AppRadius {
  static const small = 4.0;
  static const base = 8.0;
  static const medium = 12.0;
  static const large = 16.0;
  static const hero = 24.0;
}

abstract final class AppTypography {
  static TextStyle title([double size = 20]) => TextStyle(
        fontFamily: 'Sora',
        fontSize: size,
        fontWeight: FontWeight.w600,
        height: 1.4,
        color: AppColors.text,
        letterSpacing: -size * .01,
      );
  static TextStyle body([double size = 14]) => TextStyle(
        fontFamily: 'Manrope',
        fontSize: size,
        height: 1.5,
        color: AppColors.secondary,
      );
  static TextStyle label([double size = 12]) => TextStyle(
        fontFamily: 'Sora',
        fontSize: size,
        fontWeight: FontWeight.w600,
        height: 1.4,
        color: AppColors.text,
        letterSpacing: size * .02,
      );
}

abstract final class AppTheme {
  static ThemeData get dark => ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: AppColors.canvas,
        colorScheme: const ColorScheme.dark(
          primary: AppColors.primary,
          secondary: AppColors.positive,
          surface: AppColors.surface,
          onSurface: AppColors.text,
          onPrimary: AppColors.text,
          error: AppColors.error,
        ),
        fontFamily: 'Manrope',
        snackBarTheme: const SnackBarThemeData(
          backgroundColor: AppColors.high,
          contentTextStyle: TextStyle(color: AppColors.text),
          behavior: SnackBarBehavior.floating,
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: AppColors.low,
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AppRadius.large),
            borderSide: const BorderSide(color: AppColors.border),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AppRadius.large),
            borderSide: const BorderSide(color: AppColors.primary),
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AppRadius.large),
            borderSide: const BorderSide(color: AppColors.border),
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            minimumSize: const Size(44, 48),
            textStyle: AppTypography.label(14),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppRadius.large),
            ),
          ),
        ),
      );
}
