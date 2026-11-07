import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Icon,
  IconButton,
  Icons,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Text,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { stopPropagation } from '../../utils/keyboard';
import { hasSeenIntro, markIntroSeen, onOpenIntro } from '../../plugins/diddy/intro';
import { INTRO_STEPS } from './introSteps';
import * as css from './MatrixIntro.css';

/**
 * Short guide for people new to Matrix, coming from Discord (#30). Opens once after the first
 * start of an account and again from the account menu.
 */
export function MatrixIntro() {
  const mx = useMatrixClient();
  const userId = mx.getSafeUserId();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    // not right at startup: let the client finish loading first
    const timer = window.setTimeout(() => {
      if (!hasSeenIntro(userId)) setOpen(true);
    }, 4000);
    const stop = onOpenIntro(() => {
      setStep(0);
      setOpen(true);
    });
    return () => {
      window.clearTimeout(timer);
      stop();
    };
  }, [userId]);

  if (!open) return null;

  const close = () => {
    markIntroSeen(userId);
    setOpen(false);
  };
  const last = step === INTRO_STEPS.length - 1;
  const current = INTRO_STEPS[step];

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            clickOutsideDeactivates: false,
            onDeactivate: close,
            escapeDeactivates: stopPropagation,
          }}
        >
          <div
            className={css.Dialog}
            role="dialog"
            aria-modal="true"
            aria-label="Einführung in Matrix"
          >
            <Box justifyContent="SpaceBetween" alignItems="Center">
              <Text size="L400" className={css.Kicker}>
                Matrix für Discord-Umsteiger · {step + 1}/{INTRO_STEPS.length}
              </Text>
              <IconButton
                size="300"
                variant="SurfaceVariant"
                fill="None"
                radii="Pill"
                aria-label="Schließen"
                onClick={close}
              >
                <Icon size="100" src={Icons.Cross} />
              </IconButton>
            </Box>
            <Box direction="Column" gap="200">
              <Text as="h2" size="H4" className={css.Title}>
                {current.title}
              </Text>
              <Text size="T300" priority="300" className={css.Lead}>
                {current.lead}
              </Text>
            </Box>
            <div className={css.Points}>
              {current.points.map((p) => (
                <div key={p.label} className={css.Point}>
                  <Text size="T300" className={css.PointLabel}>
                    {p.label}
                  </Text>
                  <Text size="T300" priority="300" className={css.PointText}>
                    {p.text}
                  </Text>
                </div>
              ))}
            </div>
            <Box justifyContent="SpaceBetween" alignItems="Center">
              <Box gap="100" aria-hidden>
                {INTRO_STEPS.map((s, i) => (
                  <span key={s.title} className={i === step ? css.DotActive : css.Dot} />
                ))}
              </Box>
              <Box gap="200">
                {step > 0 ? (
                  <Button
                    size="300"
                    variant="Secondary"
                    fill="Soft"
                    radii="400"
                    className={css.Button}
                    onClick={() => setStep(step - 1)}
                  >
                    <Text size="B300">Zurück</Text>
                  </Button>
                ) : (
                  <Button
                    size="300"
                    variant="Secondary"
                    fill="None"
                    radii="400"
                    className={css.Button}
                    onClick={close}
                  >
                    <Text size="B300">Überspringen</Text>
                  </Button>
                )}
                <Button
                  size="300"
                  variant="Primary"
                  radii="400"
                  className={css.Button}
                  onClick={() => (last ? close() : setStep(step + 1))}
                >
                  <Text size="B300">{last ? 'Fertig' : 'Weiter'}</Text>
                </Button>
              </Box>
            </Box>
          </div>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
