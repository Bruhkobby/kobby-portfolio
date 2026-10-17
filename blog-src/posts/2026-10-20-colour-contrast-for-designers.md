---
title: Colour Contrast for Designers: Make Your Text Readable for Everyone
description: The contrast ratios that make text readable, what counts as large text, and a quick routine for checking every colour pairing in your designs.
date: 2026-10-20
category: Design
---

Good-looking design that people cannot read is not good design. Colour contrast, the difference in brightness between text and its background, is one of the easiest things to get wrong and one of the easiest to fix. It helps everyone: people with low vision or colour blindness, but also anyone reading on a phone in bright sunlight.

I ran into this on my own portfolio recently. My navigation was meant to adapt to whatever was behind it, but on light pages the menu text stayed white and simply vanished. It looked perfectly fine over the dark opening section, which is exactly how this kind of mistake survives. Here is the routine I would use to catch it.

## The numbers to know

The Web Content Accessibility Guidelines (WCAG) set the standard most people work to. Contrast is expressed as a ratio from 1:1 (no difference at all) to 21:1 (black on white).

| What you are checking | Level AA (the usual target) | Level AAA (stricter) |
| --- | --- | --- |
| Normal text | at least **4.5:1** | at least **7:1** |
| Large text | at least **3:1** | at least **4.5:1** |
| Buttons, icons and other interface parts | at least **3:1** against what is next to them | |

**What counts as large text?** 18pt or bigger, or 14pt or bigger if it is bold. In pixels that is roughly 24px, or about 18.7px bold.

**Ratios are not rounded.** Mid-grey text such as `#777777` on white measures 4.47:1, so it fails the 4.5:1 rule even though it looks "close enough".

## What is exempt

WCAG does not require contrast for:

- Logos and brand names
- Text that is purely decorative
- Disabled buttons and other inactive parts of an interface
- Text that is part of a photo with a lot of other visual content

That last point is a reason to be careful, not a loophole. If you want people to read it, make it readable.

## A routine for checking your designs

1. **List your colour pairings.** Write down every text colour and the backgrounds it sits on, including text over images and gradients.
2. **Measure each pair.** Browser developer tools show the contrast ratio when you inspect text, and there are free contrast checkers online. Check the *smallest and lightest* version of the text, since that is the one that fails first.
3. **Check the in-between states.** Hover, focus, selected and disabled styles often use lighter colours than the default.
4. **Test on real screens.** Look at your design on a phone, at low brightness, and outdoors if you can. Some problems only show up there.
5. **Do not rely on colour alone.** If red means "error" and green means "success", add an icon or a word too. Some people cannot tell those two colours apart.

## Common traps

- **Light grey on white** for captions and placeholders, because it looks elegant
- **Text on photos** without an overlay or shadow to keep it readable
- **Brand colours that do not pair well**, such as a bright orange button with white text
- **Elements that change colour depending on what is behind them**, like my navigation, which need testing on *every* background, not just one

## Fix it early

The best time to check contrast is when you choose your palette. Test each brand colour against white and against black, and note which text colour works on which. Then your designs start accessible, instead of needing patches later.

Want a site or brand that looks sharp *and* reads clearly? [Let's talk](../contact.html).

## Sources

- [Contrast and Color Accessibility](https://webaim.org/articles/contrast/), WebAIM
- [Color contrast](https://developer.mozilla.org/en-US/docs/Web/Accessibility/Understanding_WCAG/Perceivable/Color_contrast), MDN Web Docs
- [Understanding SC 1.4.6 Contrast (Enhanced)](https://w3c.github.io/wcag/understanding/contrast-enhanced.html), W3C
