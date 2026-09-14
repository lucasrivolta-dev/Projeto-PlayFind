import 'dart:async';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Discrete desktop navigation on the same PageView used for touch swipes.
class FeedPager extends StatefulWidget {
  const FeedPager({
    super.key,
    required this.active,
    required this.itemCount,
    required this.onPageChanged,
    required this.itemBuilder,
    this.frameBuilder,
    this.pageController,
  });

  static const transitionDuration = Duration(milliseconds: 320);
  static const wheelIdleDuration = Duration(milliseconds: 250);
  final bool active;
  final int itemCount;
  final ValueChanged<int> onPageChanged;
  final IndexedWidgetBuilder itemBuilder;
  final Widget Function(Widget pages)? frameBuilder;
  final PageController? pageController;

  @override
  State<FeedPager> createState() => _FeedPagerState();
}

class _FeedPagerState extends State<FeedPager> {
  PageController? _internalPages;
  PageController get _pages =>
      widget.pageController ??
      (_internalPages ??= PageController(keepPage: false));
  final _focus = FocusNode(debugLabel: 'Feed navigation');
  Timer? _wheelIdle;
  bool _animating = false;
  bool _wasActive = false;

  bool get _active =>
      widget.active && (ModalRoute.of(context)?.isCurrent ?? true);

  bool get _editingText {
    final focused = FocusManager.instance.primaryFocus?.context;
    return focused?.widget is EditableText ||
        focused?.findAncestorWidgetOfExactType<EditableText>() != null;
  }

  void _updateFocus() {
    final active = _active;
    if (active && !_wasActive) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _active && !_editingText) _focus.requestFocus();
      });
    } else if (!active && _wasActive) {
      _wheelIdle?.cancel();
      _wheelIdle = null;
      if (_focus.hasFocus) _focus.unfocus();
    }
    _wasActive = active;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _updateFocus();
  }

  @override
  void didUpdateWidget(FeedPager oldWidget) {
    super.didUpdateWidget(oldWidget);
    _updateFocus();
  }

  Future<void> _step(int direction) async {
    if (!_active ||
        _animating ||
        !_pages.hasClients ||
        widget.itemCount == 0 ||
        _pages.position.isScrollingNotifier.value) {
      return;
    }
    final current = (_pages.page ?? 0).round();
    final target = (current + direction).clamp(0, widget.itemCount - 1);
    if (target == current) return;
    _animating = true;
    try {
      await _pages.animateToPage(
        target,
        duration: FeedPager.transitionDuration,
        curve: Curves.easeInOut,
      );
    } finally {
      _animating = false;
    }
  }

  void _onPointerSignal(PointerSignalEvent signal) {
    if (!_active ||
        signal is! PointerScrollEvent ||
        signal.scrollDelta.dy == 0 ||
        signal.scrollDelta.dy.abs() < signal.scrollDelta.dx.abs()) {
      return;
    }
    // The page listener is below Scrollable in the hit-test path, so it claims
    // the signal before Scrollable's pixel scrolling can fight our animation.
    GestureBinding.instance.pointerSignalResolver.register(signal, (_) {
      signal.respond(allowPlatformDefault: false);
      final inBurst = _wheelIdle?.isActive ?? false;
      _wheelIdle?.cancel();
      _wheelIdle = Timer(FeedPager.wheelIdleDuration, () => _wheelIdle = null);
      if (!inBurst) unawaited(_step(signal.scrollDelta.dy > 0 ? 1 : -1));
    });
  }

  KeyEventResult _onKey(FocusNode node, KeyEvent event) {
    if (!_active || _editingText) return KeyEventResult.ignored;
    final direction = switch (event.logicalKey) {
      LogicalKeyboardKey.arrowDown || LogicalKeyboardKey.pageDown => 1,
      LogicalKeyboardKey.arrowUp || LogicalKeyboardKey.pageUp => -1,
      _ => 0,
    };
    if (direction == 0) return KeyEventResult.ignored;
    if (event is KeyDownEvent) unawaited(_step(direction));
    // Consume repeats too, without starting another transition.
    return KeyEventResult.handled;
  }

  @override
  void dispose() {
    _wheelIdle?.cancel();
    _focus.dispose();
    _internalPages?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Focus(
    focusNode: _focus,
    autofocus: widget.active,
    onKeyEvent: _onKey,
    child: Listener(
      onPointerDown: (_) {
        if (!_focus.hasFocus && !_editingText) {
          _focus.requestFocus();
        }
      },
      onPointerSignal: _onPointerSignal,
      child:
          widget.frameBuilder?.call(_buildPages(context)) ??
          _buildPages(context),
    ),
  );

  Widget _buildPages(BuildContext context) => ScrollConfiguration(
    behavior: ScrollConfiguration.of(context).copyWith(
      dragDevices: {
        ...ScrollConfiguration.of(context).dragDevices,
        PointerDeviceKind.mouse,
      },
    ),
    child: Listener(
      onPointerSignal: _onPointerSignal,
      child: PageView.builder(
        controller: _pages,
        dragStartBehavior: DragStartBehavior.down,
        physics: _FeedScrollPhysics(blocked: () => _animating),
        scrollDirection: Axis.vertical,
        itemCount: widget.itemCount,
        onPageChanged: widget.onPageChanged,
        itemBuilder: (context, index) => Listener(
          behavior: HitTestBehavior.opaque,
          onPointerSignal: _onPointerSignal,
          child: widget.itemBuilder(context, index),
        ),
      ),
    ),
  );
}

/// During programmatic animation Scrollable ignores its viewport's hit tests.
/// Prevent native pixel scrolling from winning against the outer wheel listener
/// in that interval, without changing the physics type or replacing its position.
class _FeedScrollPhysics extends ScrollPhysics {
  const _FeedScrollPhysics({required this.blocked, super.parent});
  final bool Function() blocked;

  @override
  _FeedScrollPhysics applyTo(ScrollPhysics? ancestor) =>
      _FeedScrollPhysics(blocked: blocked, parent: buildParent(ancestor));

  @override
  bool shouldAcceptUserOffset(ScrollMetrics position) =>
      !blocked() && super.shouldAcceptUserOffset(position);
}
