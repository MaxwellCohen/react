/* eslint-disable dot-notation */

// Shared implementation and constants between the inline script and external
// runtime instruction sets.

const ELEMENT_NODE = 1;
const COMMENT_NODE = 8;
const ACTIVITY_START_DATA = '&';
const ACTIVITY_END_DATA = '/&';
const SUSPENSE_START_DATA = '$';
const SUSPENSE_END_DATA = '/$';
const SUSPENSE_PENDING_START_DATA = '$?';
const SUSPENSE_QUEUED_START_DATA = '$~';
const SUSPENSE_FALLBACK_START_DATA = '$!';

const FALLBACK_THROTTLE_MS = 300;

const SUSPENSEY_FONT_AND_IMAGE_TIMEOUT = 500;

// If you have a target goal in mind for a metric to hit, you don't want the
// only reason you miss it by a little bit to be throttling heuristics.
// This tries to avoid throttling if avoiding it would let you hit this metric.
// This is derived from trying to hit an LCP of 2.5 seconds with some head room.
const TARGET_VANITY_METRIC = 2300;

// TODO: Symbols that are referenced outside this module use dynamic accessor
// notation instead of dot notation to prevent Closure's advanced compilation
// mode from renaming. We could use extern files instead, but I couldn't get it
// working. Closure converts it to a dot access anyway, though, so it's not an
// urgent issue.

export function revealCompletedBoundaries(batch) {
  window['$RT'] = performance.now();
  for (let i = 0; i < batch.length; i += 2) {
    const suspenseIdNode = batch[i];
    const contentNode = batch[i + 1];
    if (contentNode.parentNode === null) {
      // If the client has failed hydration we may have already deleted the streaming
      // segments. The server may also have emitted a complete instruction but cancelled
      // the segment. Regardless we can ignore this case.
    } else {
      // We can detach the content now.
      // Completions of boundaries within this contentNode will now find the boundary
      // in its designated place.
      contentNode.parentNode.removeChild(contentNode);
    }
    // Clear all the existing children. This is complicated because
    // there can be embedded Suspense boundaries in the fallback.
    // This is similar to clearSuspenseBoundary in ReactFiberConfigDOM.
    // TODO: We could avoid this if we never emitted suspense boundaries in fallback trees.
    // They never hydrate anyway. However, currently we support incrementally loading the fallback.
    const parentInstance = suspenseIdNode.parentNode;
    if (!parentInstance) {
      // We may have client-rendered this boundary already. Skip it.
      continue;
    }

    // Find the boundary around the fallback. This is always the previous node.
    const suspenseNode = suspenseIdNode.previousSibling;

    let node = suspenseIdNode;
    let depth = 0;
    do {
      if (node && node.nodeType === COMMENT_NODE) {
        const data = node.data;
        if (data === SUSPENSE_END_DATA || data === ACTIVITY_END_DATA) {
          if (depth === 0) {
            break;
          } else {
            depth--;
          }
        } else if (
          data === SUSPENSE_START_DATA ||
          data === SUSPENSE_PENDING_START_DATA ||
          data === SUSPENSE_QUEUED_START_DATA ||
          data === SUSPENSE_FALLBACK_START_DATA ||
          data === ACTIVITY_START_DATA
        ) {
          depth++;
        }
      }

      const nextNode = node.nextSibling;
      parentInstance.removeChild(node);
      node = nextNode;
    } while (node);

    const endOfBoundary = node;

    // Insert all the children from the contentNode between the start and end of suspense boundary.
    while (contentNode.firstChild) {
      parentInstance.insertBefore(contentNode.firstChild, endOfBoundary);
    }

    suspenseNode.data = SUSPENSE_START_DATA;
    if (suspenseNode['_reactRetry']) {
      requestAnimationFrame(suspenseNode['_reactRetry']);
    }
  }
  batch.length = 0;
}

export function revealCompletedBoundariesWithViewTransitions(
  revealBoundaries,
  batch,
) {
  let shouldStartViewTransition = false;
  let autoNameIdx = 0;
  const restoreQueue = [];
  function applyViewTransitionName(element, classAttributeName) {
    const className = element.getAttribute(classAttributeName);
    if (!className) {
      return;
    }
    // Add any elements we apply a name to a queue to be reverted when we start.
    const elementStyle = element.style;
    restoreQueue.push(
      element,
      elementStyle['viewTransitionName'],
      elementStyle['viewTransitionClass'],
    );
    if (className !== 'auto') {
      elementStyle['viewTransitionClass'] = className;
    }
    let name = element.getAttribute('vt-name');
    if (!name) {
      // Auto-generate a name for this one.
      // TODO: We don't have a prefix to pick from here but maybe we don't need it
      // since it's only applicable temporarily during this specific animation.
      const idPrefix = '';
      name = '_' + idPrefix + 'T_' + autoNameIdx++ + '_';
    }
    // If the name isn't valid CSS identifier, base64 encode the name instead.
    // This doesn't let you select it in custom CSS selectors but it does work in current
    // browsers.
    const escapedName =
      CSS.escape(name) !== name ? 'r-' + btoa(name).replace(/=/g, '') : name;
    elementStyle['viewTransitionName'] = escapedName;
    shouldStartViewTransition = true;
  }
  try {
    const existingTransition = document['__reactViewTransition'];
    if (existingTransition) {
      // Retry after the previous ViewTransition finishes.
      existingTransition.finished.finally(
        revealCompletedBoundariesWithViewTransitions.bind(
          null,
          revealBoundaries,
          batch,
        ),
      );
      return;
    }
    // First collect all entering names that might form pairs exiting names.
    const appearingViewTransitions = new Map();
    for (let i = 1; i < batch.length; i += 2) {
      const contentNode = batch[i];
      const appearingElements = contentNode.querySelectorAll('[vt-share]');
      for (let j = 0; j < appearingElements.length; j++) {
        const appearingElement = appearingElements[j];
        appearingViewTransitions.set(
          appearingElement.getAttribute('vt-name'),
          appearingElement,
        );
      }
    }
    const suspenseyImages = [];
    // Next we'll find the nodes that we're going to animate and apply names to them..
    for (let i = 0; i < batch.length; i += 2) {
      const suspenseIdNode = batch[i];
      const parentInstance = suspenseIdNode.parentNode;
      if (!parentInstance) {
        // We may have client-rendered this boundary already. Skip it.
        continue;
      }
      const parentRect = parentInstance.getBoundingClientRect();
      if (
        !parentRect.left &&
        !parentRect.top &&
        !parentRect.width &&
        !parentRect.height
      ) {
        // If the parent instance is display: none then we don't animate this boundary.
        // This can happen when this boundary is actually a child of a different boundary that
        // isn't yet revealed or is about to be revealed, but in that case that boundary
        // should do the exit/enter and not this one. Conveniently this also lets us skip
        // this if it's just in a hidden tree in general.
        // TODO: Should we skip it if it's out of viewport? It's possible that it gets
        // brought into the viewport by changing size.
        // TODO: There's a another case where an inner boundary is inside a fallback that
        // is about to be deleted. In that case we should not run exit animations on the inner.
        continue;
      }

      // Apply exit animations to the immediate elements inside the fallback.
      let node = suspenseIdNode;
      let depth = 0;
      while (node) {
        if (node.nodeType === COMMENT_NODE) {
          const data = node.data;
          if (data === SUSPENSE_END_DATA) {
            if (depth === 0) {
              break;
            } else {
              depth--;
            }
          } else if (
            data === SUSPENSE_START_DATA ||
            data === SUSPENSE_PENDING_START_DATA ||
            data === SUSPENSE_QUEUED_START_DATA ||
            data === SUSPENSE_FALLBACK_START_DATA
          ) {
            depth++;
          }
        } else if (node.nodeType === ELEMENT_NODE) {
          const exitElement = node;
          const exitName = exitElement.getAttribute('vt-name');
          const pairedElement = appearingViewTransitions.get(exitName);
          applyViewTransitionName(
            exitElement,
            pairedElement ? 'vt-share' : 'vt-exit',
          );
          if (pairedElement) {
            // Activate the other side as well.
            applyViewTransitionName(pairedElement, 'vt-share');
            appearingViewTransitions.set(exitName, null); // mark claimed
          }
          // Next we'll look inside this element for pairs to trigger "share".
          const disappearingElements =
            exitElement.querySelectorAll('[vt-share]');
          for (let j = 0; j < disappearingElements.length; j++) {
            const disappearingElement = disappearingElements[j];
            const name = disappearingElement.getAttribute('vt-name');
            const appearingElement = appearingViewTransitions.get(name);
            if (appearingElement) {
              applyViewTransitionName(disappearingElement, 'vt-share');
              applyViewTransitionName(appearingElement, 'vt-share');
              appearingViewTransitions.set(name, null); // mark claimed
            }
          }
          // Relay the exit to nested ViewTransitions that opted in
          const relayExitElements =
            exitElement.querySelectorAll('[vt-parent-exit]');
          for (let j = 0; j < relayExitElements.length; j++) {
            applyViewTransitionName(relayExitElements[j], 'vt-parent-exit');
          }
        }
        node = node.nextSibling;
      }

      // Apply enter animations to the new nodes about to be inserted.
      const contentNode = batch[i + 1];
      let enterElement = contentNode.firstElementChild;
      while (enterElement) {
        const paired =
          appearingViewTransitions.get(enterElement.getAttribute('vt-name')) ===
          null;
        if (!paired) {
          applyViewTransitionName(enterElement, 'vt-enter');
        }
        // Relay the enter to nested ViewTransitions that opted in
        const relayEnterElements =
          enterElement.querySelectorAll('[vt-parent-enter]');
        for (let j = 0; j < relayEnterElements.length; j++) {
          applyViewTransitionName(relayEnterElements[j], 'vt-parent-enter');
        }
        enterElement = enterElement.nextElementSibling;
      }

      // Apply update animations to any parents and siblings that might be affected.
      let ancestorElement = parentInstance;
      do {
        let childElement = ancestorElement.firstElementChild;
        while (childElement) {
          // TODO: Bail out if we can
          const updateClassName = childElement.getAttribute('vt-update');
          if (
            updateClassName &&
            updateClassName !== 'none' &&
            !restoreQueue.includes(childElement)
          ) {
            // If we have already handled this element as part of another exit/enter/share, don't override.
            applyViewTransitionName(childElement, 'vt-update');
          }
          childElement = childElement.nextElementSibling;
        }
      } while (
        (ancestorElement = ancestorElement.parentNode) &&
        ancestorElement.nodeType === ELEMENT_NODE &&
        ancestorElement.getAttribute('vt-update') !== 'none'
      );

      // Find the appearing Suspensey Images inside the new content.
      const appearingImages = contentNode.querySelectorAll(
        'img[src]:not([loading="lazy"])',
      );
      // TODO: Consider marking shouldStartViewTransition if we found any images.
      // But only once we can disable the root animation for that case.
      suspenseyImages.push.apply(suspenseyImages, appearingImages);
    }
    if (shouldStartViewTransition) {
      const transition = (document['__reactViewTransition'] = document[
        'startViewTransition'
      ]({
        update: () => {
          revealBoundaries(batch);
          const blockingPromises = [
            // Force layout to trigger font loading, we stash the actual value to trick minifiers.
            document.documentElement.clientHeight,
            // Block on fonts finishing loading before revealing these boundaries.
            document.fonts.ready,
          ];
          for (let i = 0; i < suspenseyImages.length; i++) {
            const suspenseyImage = suspenseyImages[i];
            if (!suspenseyImage.complete) {
              const rect = suspenseyImage.getBoundingClientRect();
              const inViewport =
                rect.bottom > 0 &&
                rect.right > 0 &&
                rect.top < window.innerHeight &&
                rect.left < window.innerWidth;
              if (inViewport) {
                // TODO: Use decode() instead of the load event here once the fix in
                // https://issues.chromium.org/issues/420748301 has propagated fully.
                const loadingImage = new Promise(resolve => {
                  suspenseyImage.addEventListener('load', resolve);
                  suspenseyImage.addEventListener('error', resolve);
                });
                blockingPromises.push(loadingImage);
              }
            }
          }
          return Promise.race([
            Promise.all(blockingPromises),
            new Promise(resolve => {
              const currentTime = performance.now();
              const msUntilTimeout =
                // If the throttle would make us miss the target metric, then shorten the throttle.
                // performance.now()'s zero value is assumed to be the start time of the metric.
                currentTime < TARGET_VANITY_METRIC &&
                currentTime > TARGET_VANITY_METRIC - FALLBACK_THROTTLE_MS
                  ? TARGET_VANITY_METRIC - currentTime
                  : // Otherwise it's throttled starting from last commit time.
                    SUSPENSEY_FONT_AND_IMAGE_TIMEOUT;
              setTimeout(resolve, msUntilTimeout);
            }),
          ]);
        },
        types: [], // TODO: Add a hard coded type for Suspense reveals.
      }));
      transition.ready.finally(() => {
        // Restore all the names/classes that we applied to what they were before.
        // We do it in reverse order in case there were duplicates so the first one wins.
        for (let i = restoreQueue.length - 3; i >= 0; i -= 3) {
          const element = restoreQueue[i];
          const elementStyle = element.style;
          const previousName = restoreQueue[i + 1];
          elementStyle['viewTransitionName'] = previousName;
          const previousClassName = restoreQueue[i + 1];
          elementStyle['viewTransitionClass'] = previousClassName;
          if (element.getAttribute('style') === '') {
            element.removeAttribute('style');
          }
        }
      });
      transition.finished.finally(() => {
        if (document['__reactViewTransition'] === transition) {
          document['__reactViewTransition'] = null;
        }
      });
      // Queue any future completions into its own batch since they won't have been
      // snapshotted by this one.
      window['$RB'] = [];
      return;
    }
    // Fall through to reveal.
  } catch (x) {
    // Fall through to reveal.
  }
  // ViewTransitions v2 not supported or no ViewTransitions found. Reveal immediately.
  revealBoundaries(batch);
}

export function clientRenderBoundary(
  suspenseBoundaryID,
  errorDigest,
  errorMsg,
  errorStack,
  errorComponentStack,
) {
  // Find the fallback's first element.
  const suspenseIdNode = document.getElementById(suspenseBoundaryID);
  if (!suspenseIdNode) {
    // The user must have already navigated away from this tree.
    // E.g. because the parent was hydrated.
    return;
  }
  // Find the boundary around the fallback. This is always the previous node.
  const suspenseNode = suspenseIdNode.previousSibling;
  // Tag it to be client rendered.
  suspenseNode.data = SUSPENSE_FALLBACK_START_DATA;
  // assign error metadata to first sibling
  const dataset = suspenseIdNode.dataset;
  if (errorDigest != null) dataset['dgst'] = errorDigest;
  if (errorMsg) dataset['msg'] = errorMsg;
  if (errorStack) dataset['stck'] = errorStack;
  if (errorComponentStack) dataset['cstck'] = errorComponentStack;
  // Tell React to retry it if the parent already hydrated.
  if (suspenseNode['_reactRetry']) {
    suspenseNode['_reactRetry']();
  }
}

export function completeBoundary(suspenseBoundaryID, contentID) {
  const contentNodeOuter = document.getElementById(contentID);
  if (!contentNodeOuter) {
    // If the client has failed hydration we may have already deleted the streaming
    // segments. The server may also have emitted a complete instruction but cancelled
    // the segment. Regardless we can ignore this case.
    return;
  }

  // Find the fallback's first element.
  const suspenseIdNodeOuter = document.getElementById(suspenseBoundaryID);
  if (!suspenseIdNodeOuter) {
    // We'll never reveal this boundary so we can remove its content immediately.
    // Otherwise we'll leave it in until we reveal it.
    // This is important in case this specific boundary contains other boundaries
    // that may get completed before we reveal this one.
    contentNodeOuter.parentNode.removeChild(contentNodeOuter);

    // The user must have already navigated away from this tree.
    // E.g. because the parent was hydrated. That's fine there's nothing to do
    // but we have to make sure that we already deleted the container node.
    return;
  }

  // Mark this Suspense boundary as queued so we know not to client render it
  // at the end of document load.
  const suspenseNodeOuter = suspenseIdNodeOuter.previousSibling;
  suspenseNodeOuter.data = SUSPENSE_QUEUED_START_DATA;
  // Queue this boundary for the next batch
  window['$RB'].push(suspenseIdNodeOuter, contentNodeOuter);

  if (window['$RB'].length === 2) {
    // This is the first time we've pushed to the batch. We need to schedule a callback
    // to flush the batch. This is delayed by the throttle heuristic.
    if (typeof window['$RT'] !== 'number') {
      // If we haven't had our rAF callback yet, schedule everything for the first paint.
      requestAnimationFrame(window['$RV'].bind(null, window['$RB']));
    } else {
      const currentTime = performance.now();
      const msUntilTimeout =
        // If the throttle would make us miss the target metric, then shorten the throttle.
        // performance.now()'s zero value is assumed to be the start time of the metric.
        currentTime < TARGET_VANITY_METRIC &&
        currentTime > TARGET_VANITY_METRIC - FALLBACK_THROTTLE_MS
          ? TARGET_VANITY_METRIC - currentTime
          : // Otherwise it's throttled starting from last commit time.
            window['$RT'] + FALLBACK_THROTTLE_MS - currentTime;
      // We always schedule the flush in a timer even if it's very low or negative to allow
      // for multiple completeBoundary calls that are already queued to have a chance to
      // make the batch.
      setTimeout(window['$RV'].bind(null, window['$RB']), msUntilTimeout);
    }
  }
}

export function completeBoundaryWithStyles(
  suspenseBoundaryID,
  contentID,
  stylesheetDescriptors,
) {
  const precedences = new Map();
  const thisDocument = document;
  let lastResource, node;

  // Seed the precedence list with existing resources and collect hoistable style tags
  const nodes = thisDocument.querySelectorAll(
    'link[data-precedence],style[data-precedence]',
  );
  const styleTagsToHoist = [];
  for (let i = 0; (node = nodes[i++]); ) {
    if (node.getAttribute('media') === 'not all') {
      styleTagsToHoist.push(node);
    } else {
      if (node.tagName === 'LINK') {
        window['$RM'].set(node.getAttribute('href'), node);
      }
      precedences.set(node.dataset['precedence'], (lastResource = node));
    }
  }

  let i = 0;
  const dependencies = [];
  let href, precedence, attr, loadingState, resourceEl, media;

  function cleanupWith(cb) {
    this['_p'] = null;
    cb();
  }

  // Sheets Mode
  let sheetMode = true;
  while (true) {
    if (sheetMode) {
      // Sheet Mode iterates over the stylesheet arguments and constructs them if new or checks them for
      // dependency if they already existed
      const stylesheetDescriptor = stylesheetDescriptors[i++];
      if (!stylesheetDescriptor) {
        // enter <style> Mode
        sheetMode = false;
        i = 0;
        continue;
      }

      let avoidInsert = false;
      let j = 0;
      href = stylesheetDescriptor[j++];

      if ((resourceEl = window['$RM'].get(href))) {
        // We have an already inserted stylesheet.
        loadingState = resourceEl['_p'];
        avoidInsert = true;
      } else {
        // We haven't already processed this href so we need to construct a stylesheet and hoist it
        // We construct it here and attach a loadingState. We also check whether it matches
        // media before we include it in the dependency array.
        resourceEl = thisDocument.createElement('link');
        resourceEl.href = href;
        resourceEl.rel = 'stylesheet';
        resourceEl.dataset['precedence'] = precedence =
          stylesheetDescriptor[j++];
        while ((attr = stylesheetDescriptor[j++])) {
          resourceEl.setAttribute(attr, stylesheetDescriptor[j++]);
        }
        loadingState = resourceEl['_p'] = new Promise((resolve, reject) => {
          resourceEl.onload = cleanupWith.bind(resourceEl, resolve);
          resourceEl.onerror = cleanupWith.bind(resourceEl, reject);
        });
        // Save this resource element so we can bailout if it is used again
        window['$RM'].set(href, resourceEl);
      }
      media = resourceEl.getAttribute('media');
      if (loadingState && (!media || window['matchMedia'](media).matches)) {
        dependencies.push(loadingState);
      }
      if (avoidInsert) {
        // We have a link that is already in the document. We don't want to fall through to the insert path
        continue;
      }
    } else {
      // <style> mode iterates over not-yet-hoisted <style> tags with data-precedence and hoists them.
      resourceEl = styleTagsToHoist[i++];
      if (!resourceEl) {
        // we are done with all style tags
        break;
      }

      precedence = resourceEl.getAttribute('data-precedence');
      resourceEl.removeAttribute('media');
    }

    // resourceEl is either a newly constructed <link rel="stylesheet" ...> or a <style> tag requiring hoisting
    const prior = precedences.get(precedence) || lastResource;
    if (prior === lastResource) {
      lastResource = resourceEl;
    }
    precedences.set(precedence, resourceEl);

    // Finally, we insert the newly constructed instance at an appropriate location
    // in the Document.
    if (prior) {
      prior.parentNode.insertBefore(resourceEl, prior.nextSibling);
    } else {
      const head = thisDocument.head;
      head.insertBefore(resourceEl, head.firstChild);
    }
  }

  const suspenseIdNodeOuter = document.getElementById(suspenseBoundaryID);
  if (suspenseIdNodeOuter) {
    // Mark this Suspense boundary as queued so we know not to client render it
    // at the end of document load.
    const suspenseNodeOuter = suspenseIdNodeOuter.previousSibling;
    suspenseNodeOuter.data = SUSPENSE_QUEUED_START_DATA;
  }

  Promise.all(dependencies).then(
    window['$RC'].bind(null, suspenseBoundaryID, contentID),
    window['$RX'].bind(null, suspenseBoundaryID, 'CSS failed to load'),
  );
}

export function completeSegment(containerID, placeholderID) {
  const segmentContainer = document.getElementById(containerID);
  const placeholderNode = document.getElementById(placeholderID);
  // We always expect both nodes to exist here because, while we might
  // have navigated away from the main tree, we still expect the detached
  // tree to exist.
  segmentContainer.parentNode.removeChild(segmentContainer);
  while (segmentContainer.firstChild) {
    placeholderNode.parentNode.insertBefore(
      segmentContainer.firstChild,
      placeholderNode,
    );
  }
  placeholderNode.parentNode.removeChild(placeholderNode);
}

// This is the exact URL string we expect that Fizz renders if we provide a function action.
// We use this for hydration warnings. It needs to be in sync with Fizz. Maybe makes sense
// as a shared module for that reason.
const EXPECTED_FORM_ACTION_URL =
  // eslint-disable-next-line no-script-url
  "javascript:throw new Error('React form unexpectedly submitted.')";

export function listenToFormSubmissionsForReplaying() {
  // A global replay queue ensures actions are replayed in order.
  // This event listener should be above the React one. That way when
  // we preventDefault in React's handling we also prevent this event
  // from queing it. Since React listens to the root and the top most
  // container you can use is the document, the window is fine.
  // eslint-disable-next-line no-restricted-globals
  addEventListener('submit', event => {
    if (event.defaultPrevented) {
      // We let earlier events to prevent the action from submitting.
      return;
    }
    const form = event.target;
    const submitter = event['submitter'];
    let action = form.action;
    let formDataSubmitter = submitter;
    if (submitter) {
      const submitterAction = submitter.getAttribute('formAction');
      if (submitterAction != null) {
        // The submitter overrides the action.
        action = submitterAction;
        // If the submitter overrides the action, and it passes the test below,
        // that means that it was a function action which conceptually has no name.
        // Therefore, we exclude the submitter from the formdata.
        formDataSubmitter = null;
      }
    }
    if (action !== EXPECTED_FORM_ACTION_URL) {
      // The form is a regular form action, we can bail.
      return;
    }

    // Prevent native navigation.
    // This will also prevent other React's on the same page from listening.
    event.preventDefault();

    // Take a snapshot of the FormData at the time of the event.
    const formData = new FormData(form, formDataSubmitter);

    // Queue for replaying later. This field could potentially be shared with multiple
    // Reacts on the same page since each one will preventDefault for the next one.
    // This means that this protocol is shared with any React version that shares the same
    // javascript: URL placeholder value. So we might not be the first to declare it.
    // We attach it to the form's root node, which is the shared environment context
    // where we preserve sequencing and where we'll pick it up from during hydration.
    // If there's no ownerDocument, then this is the document.
    const root = form.ownerDocument || form;
    (root['$$reactFormReplay'] = root['$$reactFormReplay'] || []).push(
      form,
      submitter,
      formData,
    );
  });
}

const XHTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const PROCESSING_INSTRUCTION_NODE = 7;

// Declarative patching ($RP).
//
// Progressive enhancement: without scripts a browser with native support applies each
// <template for="B:n"> to its <?start name="B:n"> range as it parses. With scripts,
// $RP() runs once after the shell and collects every named start marker into $RPS
// (id → node) and $RPI (node → id WeakMap), then blanks the name so native matching
// cannot fire. That is what makes batching possible when scripts run.
//
// $RP("B:0","B:1") follows a group of <template for="B:n"> patches. It queues the ids and
// applies everything queued after the same throttle as $RC (FALLBACK_THROTTLE_MS since
// the last reveal). Each boundary is found via $RPS; its <!--$?--> is the previous
// sibling of the start marker. Nested <?start> markers inside the inserted content are
// collected into the maps the same way. Boundaries inside SVG/MathML are then reparsed
// in the right namespace. After a successful replace the script flips $? to $ and
// calls _reactRetry (native / no-script hydration watches the marker with a
// MutationObserver instead).
function ensureDeclarativeMaps() {
  if (!window['$RPS']) {
    window['$RPS'] = new Map();
  }
  if (!window['$RPI']) {
    window['$RPI'] = new WeakMap();
  }
}

function isDeclarativeStartMarker(node) {
  if (node == null) {
    return false;
  }
  if (node.nodeType === PROCESSING_INSTRUCTION_NODE) {
    return node['target'] === 'start';
  }
  return node.nodeType === COMMENT_NODE && node.data.indexOf('?start') === 0;
}

function getDeclarativeStartName(node) {
  const match = /name="([^"]*)"/.exec(node.data);
  return match !== null ? match[1] : '';
}

// Register one named <?start> into $RPS/$RPI and blank its name so native
// <template for> cannot match. Already-blanked markers are left alone.
function registerAndBlankMarker(marker) {
  const id = getDeclarativeStartName(marker);
  if (id === '') {
    return;
  }
  ensureDeclarativeMaps();
  window['$RPS'].set(id, marker);
  window['$RPI'].set(marker, id);
  if (marker.nodeType === PROCESSING_INSTRUCTION_NODE) {
    marker.data = 'name=""';
  } else {
    marker.data = '?start name=""';
  }
}

// Collect every named <?start> under root into $RPS/$RPI and blank the name so native
// <template for> cannot match. Already-blanked markers are left alone.
export function collectDeclarativeBoundaries(root) {
  ensureDeclarativeMaps();
  const markers = [];
  let node;
  // Native browsers: processing instructions.
  const instructions = document.createNodeIterator(root, 64);
  while ((node = instructions.nextNode())) {
    if (node['target'] === 'start') {
      markers.push(node);
    }
  }
  // Everyone else parses <?start …> as a comment.
  const comments = document.createNodeIterator(root, 128);
  while ((node = comments.nextNode())) {
    if (node.data.indexOf('?start') === 0) {
      markers.push(node);
    }
  }
  for (let i = 0; i < markers.length; i++) {
    registerAndBlankMarker(markers[i]);
  }
}

// Collect-only observer: blank/register late <?start> markers as the parser adds them.
// This is NOT the apply path — patches still go through $RP("B:n") announce. Without it
// every $RP call would have to re-walk the document, which cliffs at hundreds of
// boundaries when the server does not hold flushes.
export function ensureDeclarativeCollector() {
  if (window['$RPO']) {
    return;
  }
  ensureDeclarativeMaps();
  window['$RPO'] = new MutationObserver(records => {
    for (let i = 0; i < records.length; i++) {
      const added = records[i].addedNodes;
      for (let j = 0; j < added.length; j++) {
        const node = added[j];
        if (isDeclarativeStartMarker(node)) {
          registerAndBlankMarker(node);
        }
      }
    }
  });
  window['$RPO'].observe(document, {childList: true, subtree: true});
}

function findDeclarativeTemplate(id) {
  // Ids are React-generated (prefix + hex); quote them for the attribute selector.
  return document.querySelector('template[for="' + id + '"]');
}

// If any id is missing from $RPS (observer has not run yet, or the marker still lives
// inside another patch's <template> content), do one collect of the document and of
// every pending template's content. Avoids a full walk on the common (already-mapped)
// path; nested parents-before-children still need the template.content pass.
function ensureMarkersFor(ids) {
  const starts = window['$RPS'];
  for (let i = 0; i < ids.length; i++) {
    if (!starts || !starts.has(ids[i])) {
      collectDeclarativeBoundaries(document);
      const found = document.querySelectorAll('template[for]');
      for (let j = 0; j < found.length; j++) {
        collectDeclarativeBoundaries(found[j].content);
      }
      return;
    }
  }
}

export function patchDeclarativeBoundaries() {
  if (arguments.length === 0) {
    collectDeclarativeBoundaries(document);
    ensureDeclarativeCollector();
    // Track the paint time of the shell, like markShellTime does for $RC.
    requestAnimationFrame(() => {
      window['$RT'] = performance.now();
    });
    return;
  }
  // Late markers must be registered even when the shell $RP() was skipped (e.g. the
  // external runtime loaded after the shell).
  ensureDeclarativeCollector();
  const queue = window['$RPQ'];
  const first = queue.length === 0;
  const ids = [];
  for (let i = 0; i < arguments.length; i++) {
    ids.push(arguments[i]);
    queue.push(arguments[i]);
  }
  queueDeclarativePatches(ids);
  if (!first) {
    return;
  }
  // This is the first patch of the batch. Flush it after the throttle.
  // Schedule via $RPF (not a direct function ref) so a separately-eval'd View
  // Transitions upgrade cannot clobber the flush by reusing its minified name.
  // Race a 250ms timer against the first paint: WebKit throttles rAF in iframes.
  if (typeof window['$RT'] !== 'number') {
    let scheduled = false;
    const kick = () => {
      if (!scheduled) {
        scheduled = true;
        window['$RPF']();
      }
    };
    requestAnimationFrame(kick);
    setTimeout(kick, 250);
  } else {
    const currentTime = performance.now();
    const msUntilTimeout =
      currentTime < TARGET_VANITY_METRIC &&
      currentTime > TARGET_VANITY_METRIC - FALLBACK_THROTTLE_MS
        ? TARGET_VANITY_METRIC - currentTime
        : window['$RT'] + FALLBACK_THROTTLE_MS - currentTime;
    // Always use a timer, even for a low or negative delay, so that patches that are
    // already queued make the batch.
    setTimeout(window['$RPF'], msUntilTimeout);
  }
}

// Calls fn(marker, template, id) for each queued id whose start marker is currently in
// the document (parents), then for markers that only live inside other patches' template
// content (children). Lookups are O(ids) via $RPS + per-id template query — no document walk.
function forEachPatch(ids, fn) {
  ensureMarkersFor(ids);
  const wanted = {};
  for (let i = 0; i < ids.length; i++) {
    wanted[ids[i]] = 1;
  }
  const starts = window['$RPS'];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (wanted[id] !== 1) {
      continue;
    }
    const marker = starts.get(id);
    if (marker && document.contains(marker)) {
      wanted[id] = 2;
      fn(marker, findDeclarativeTemplate(id), id);
    }
  }
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (wanted[id] !== 1) {
      continue;
    }
    const marker = starts.get(id);
    if (marker) {
      wanted[id] = 2;
      fn(marker, findDeclarativeTemplate(id), id);
    }
  }
  return wanted;
}

// Like $RC does when it queues a boundary: mark it as queued so React does not client
// render it while the reveal waits for the throttle. Template lookup and orphan cleanup
// wait for the flush — every completion emits $RP(ids), so work here must stay O(ids)
// Map gets, not querySelector.
function queueDeclarativePatches(ids) {
  ensureMarkersFor(ids);
  const starts = window['$RPS'];
  for (let i = 0; i < ids.length; i++) {
    const marker = starts && starts.get(ids[i]);
    if (!marker) {
      continue;
    }
    const start = marker.previousSibling;
    if (
      start &&
      start.nodeType === COMMENT_NODE &&
      start.data === SUSPENSE_PENDING_START_DATA
    ) {
      start.data = SUSPENSE_QUEUED_START_DATA;
    }
  }
}

// The base of $RW, like revealCompletedBoundaries is for $RV. The batch carries the ids
// of the patches to apply.
export function revealDeclarativePatches(batch) {
  window['$RT'] = performance.now();
  patchDeclarativeGroup(batch['ids']);
}

export function flushDeclarativePatches() {
  const ids = window['$RPQ'];
  window['$RPQ'] = [];
  const batch = [];
  batch['ids'] = ids;
  if (window['$RW'] !== revealDeclarativePatches) {
    // Upgraded to View Transitions. Hand it the boundaries to animate, as $RV gets them:
    // the start of each fallback range and the content that replaces it.
    forEachPatch(ids, (marker, template) => {
      const start = marker.previousSibling;
      if (
        template &&
        start &&
        start.nodeType === COMMENT_NODE &&
        isDeclarativeStartMarker(marker) &&
        document.contains(marker)
      ) {
        batch.push(marker, template.content);
      }
    });
  }
  window['$RW'](batch);
}

function patchDeclarativeGroup(args) {
  ensureMarkersFor(args);
  const wanted = {};
  let remaining = 0;
  for (let i = 0; i < args.length; i++) {
    if (wanted[args[i]] !== 1) {
      wanted[args[i]] = 1;
      remaining++;
    }
  }
  // Index templates once per flush, not per boundary.
  const templates = {};
  const found = document.querySelectorAll('template[for]');
  for (let i = 0; i < found.length; i++) {
    templates[found[i].getAttribute('for')] = found[i];
  }
  // Parents (markers in the document) first. Replacing a parent inserts its children,
  // which are then collected and become document-visible on the next pass.
  let safety = remaining + 1;
  while (remaining && safety--) {
    let progress = false;
    for (let i = 0; i < args.length; i++) {
      const id = args[i];
      if (wanted[id] !== 1) {
        continue;
      }
      const marker = window['$RPS'].get(id);
      if (marker && document.contains(marker)) {
        wanted[id] = 2;
        remaining--;
        progress = true;
        patchBoundary(marker, templates[id], id);
      }
    }
    if (!progress) {
      break;
    }
  }
  // Drop templates for boundaries we never found in the document (native already
  // applied, or the boundary was removed before the patch arrived).
  for (let i = 0; i < args.length; i++) {
    const id = args[i];
    if (wanted[id] === 1) {
      wanted[id] = 2;
      const template = templates[id];
      if (template && template.parentNode) {
        template.parentNode.removeChild(template);
      }
      window['$RPS'].delete(id);
    }
  }
}

function patchBoundary(marker, template, id) {
  const start = marker.previousSibling;
  if (!start || start.nodeType !== COMMENT_NODE) {
    if (template && template.parentNode) {
      template.parentNode.removeChild(template);
    }
    window['$RPS'].delete(id);
    return;
  }
  if (template) {
    // Only a still-pending boundary whose collected start marker is intact may be
    // replaced. Otherwise the template is an orphan and is dropped.
    if (
      (start.data !== SUSPENSE_PENDING_START_DATA &&
        start.data !== SUSPENSE_QUEUED_START_DATA) ||
      !isDeclarativeStartMarker(marker)
    ) {
      template.parentNode.removeChild(template);
      window['$RPS'].delete(id);
      return;
    }
  }
  // The boundary ends at the matching <!--/$-->. Nested boundaries are counted.
  let depth = 1;
  let end = start.nextSibling;
  for (; end; end = end.nextSibling) {
    if (end.nodeType === COMMENT_NODE) {
      const data = end.data;
      if (data === SUSPENSE_END_DATA) {
        if (--depth === 0) {
          break;
        }
      } else if (
        data === SUSPENSE_START_DATA ||
        data === SUSPENSE_PENDING_START_DATA ||
        data === SUSPENSE_FALLBACK_START_DATA ||
        data === SUSPENSE_QUEUED_START_DATA
      ) {
        depth++;
      }
    }
  }
  if (!end) {
    return;
  }
  // DOM React already owns in this range (a client render got there first, or it
  // hydrated a natively applied patch) must survive untouched.
  let owned = false;
  for (let node = start.nextSibling; node !== end && !owned; ) {
    const keys = Object.keys(node);
    for (let i = 0; i < keys.length; i++) {
      if (keys[i].indexOf('__reactFiber$') === 0) {
        owned = true;
      }
    }
    node = node.nextSibling;
  }
  if (template) {
    if (!owned) {
      let node;
      while ((node = start.nextSibling) !== end) {
        node.parentNode.removeChild(node);
      }
      // Nested boundaries in the content must not be matched natively either.
      collectDeclarativeBoundaries(template.content);
      start.after(template.content);
      // Revealed. Let React know, like $RC does.
      start.data = SUSPENSE_START_DATA;
      if (start['_reactRetry']) {
        requestAnimationFrame(start['_reactRetry']);
      }
    }
    template.parentNode.removeChild(template);
  }
  window['$RPS'].delete(id);
  // Template content is parsed as HTML. Inside SVG and MathML the nodes have to be
  // parsed again in their parent's namespace (HTML integration points excluded).
  // Needed even when native DPU already applied the template.
  const parent = start.parentNode;
  if (
    !owned &&
    parent &&
    parent.namespaceURI !== XHTML_NAMESPACE &&
    parent.localName !== 'foreignObject' &&
    parent.localName !== 'desc' &&
    parent.localName !== 'title'
  ) {
    for (let node = start.nextSibling, next; node !== end; node = next) {
      next = node.nextSibling;
      if (parent.namespaceURI === SVG_NAMESPACE) {
        node = restoreSvgImages(node);
      }
      node.outerHTML = node.outerHTML;
    }
  }
  if (!owned) {
    hoistPatchStyles(start, end);
  }
}

// The HTML parser turns <image> into <img> (an SVG element that is not allowed to be
// reparsed, since <img> breaks out of SVG). Turn those back before the reparse, except
// in <foreignObject> where <img> is real HTML.
function restoreSvgImages(node) {
  if (node.nodeType !== ELEMENT_NODE) {
    return node;
  }
  const images = node.querySelectorAll('img');
  const list = node.localName === 'img' ? [node] : [];
  for (let i = 0; i < images.length; i++) {
    list.push(images[i]);
  }
  for (let i = 0; i < list.length; i++) {
    const img = list[i];
    let ancestor = img.parentNode;
    while (ancestor && ancestor !== node.parentNode) {
      if (ancestor.localName === 'foreignobject') {
        break;
      }
      ancestor = ancestor.parentNode;
    }
    if (ancestor && ancestor !== node.parentNode) {
      continue;
    }
    const image = document.createElementNS(SVG_NAMESPACE, 'image');
    for (let j = 0; j < img.attributes.length; j++) {
      image.setAttribute(img.attributes[j].name, img.attributes[j].value);
    }
    img.parentNode.replaceChild(image, img);
    if (img === node) {
      node = image;
    }
  }
  return node;
}

// Late <style data-precedence> rules arrive inside the patch. Move them to where a
// hoisted style of that precedence belongs: after the last resource with the same
// precedence, or after the last resource of all, like $RR does for a new precedence.
function hoistPatchStyles(start, end) {
  for (let node = start.nextSibling, next; node !== end; node = next) {
    next = node.nextSibling;
    if (
      node.nodeType === ELEMENT_NODE &&
      node.localName === 'style' &&
      node.hasAttribute('data-precedence')
    ) {
      const precedence = node.getAttribute('data-precedence');
      const resources = document.head.querySelectorAll(
        'link[data-precedence],style[data-precedence]',
      );
      let prior, last;
      for (let i = 0; i < resources.length; i++) {
        last = resources[i];
        if (last.getAttribute('data-precedence') === precedence) {
          prior = last;
        }
      }
      prior = prior || last;
      if (prior) {
        prior.parentNode.insertBefore(node, prior.nextSibling);
      } else {
        document.head.insertBefore(node, document.head.firstChild);
      }
    }
  }
}
