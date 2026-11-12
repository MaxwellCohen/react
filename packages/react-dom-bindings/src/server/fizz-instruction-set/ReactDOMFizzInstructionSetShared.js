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
// A pending boundary is written as <!--$?--><?start name="B:n">fallback<?end><!--/$-->
// and completes with a <template for="B:n"> that holds its content. Without scripts a
// browser with native support applies the template to the range as it parses.
//
// With scripts, $RP() runs once after the shell. It indexes the start markers by id
// and swaps the ones that are processing instructions for the comment that a browser
// without native support parses them as. A comment is not a target for the parser, so
// the browser leaves each patch in the document as an inert <template for>, and reveals
// can be batched behind the same throttle as $RC.
//
// Patches are not announced by a script. They are appended to the element the stream
// is written to, which $RP() observes. The server ends each group of patches with an
// empty comment (the sentinel): everything before it has been parsed completely. Each
// patch is then queued on $RB for $RV, the reveal of the script path, with the start
// marker in the place of the <template id="B:n"> and the template content in the place
// of the hidden segment. The server writes <script>$RP()</script> instead of the
// sentinel when a group has to wait for a stylesheet or for a helper in that script.

// id → start marker.
const declarativeMarkers = new Map();
// Set once a marker was a processing instruction: the browser parses them natively,
// so a marker is never a comment and comments do not have to be walked.
let declarativeNative = false;
// Observes the element that the stream is appended to.
let declarativeObserver = null;
// The patches that were parsed, or are being parsed, since the last sentinel.
let declarativePatches = [];
// The ids React generates: an optional identifierPrefix, then B: and a hex number.
// Markers and templates with any other name belong to the page.
const DECLARATIVE_ID = /^\?start name="([^"]*B:[\da-f]+)"$/;
const DECLARATIVE_FOR = /B:[\da-f]+$/;

// Indexes one <?start> marker. Returns true if the <?end> that follows it has to be
// swapped as well.
function registerDeclarativeMarker(node) {
  const isInstruction = node.nodeType === PROCESSING_INSTRUCTION_NODE;
  let data = node.data;
  if (isInstruction) {
    if (node['target'] !== 'start') {
      return false;
    }
    data = '?start ' + data;
  } else if (data.charCodeAt(0) !== 63) {
    // Not a "?": one of the many other comments of the shell.
    return false;
  }
  const match = DECLARATIVE_ID.exec(data);
  if (match === null) {
    return false;
  }
  if (isInstruction) {
    declarativeNative = true;
    const comment = document.createComment(data);
    node.parentNode.replaceChild(comment, node);
    node = comment;
  }
  declarativeMarkers.set(match[1], node);
  return isInstruction;
}

function collectDeclarativeMarkers(root) {
  // Processing instructions first. Only a browser that never produced one has its
  // markers in comments. A TreeWalker and not a NodeIterator, because a document has
  // to update every live NodeIterator each time a node is removed.
  for (
    let whatToShow = 64;
    whatToShow !== 0;
    whatToShow = declarativeNative || whatToShow === 128 ? 0 : 128
  ) {
    const walker = document.createTreeWalker(root, whatToShow);
    let node = walker.nextNode();
    let unmatchedEnds = 0;
    while (node) {
      // The node is replaced below, so move on first.
      const next = walker.nextNode();
      if (registerDeclarativeMarker(node)) {
        unmatchedEnds++;
      } else if (
        unmatchedEnds !== 0 &&
        node.nodeType === PROCESSING_INSTRUCTION_NODE &&
        node['target'] === 'end'
      ) {
        // Moving a processing instruction into the document is far slower than
        // moving a comment, and this one would move with the fallback or the content.
        unmatchedEnds--;
        node.parentNode.replaceChild(document.createComment('?end'), node);
      }
      node = next;
    }
  }
}

// The <!--$?--> of a boundary that is still pending, or null. A boundary is patched
// or errors once, and React removes the marker with the boundary when it client
// renders it.
function takeDeclarativeBoundary(id) {
  if (!declarativeMarkers.has(id)) {
    // The shell call was skipped, or this marker was parsed after it.
    collectDeclarativeMarkers(document);
  }
  const marker = declarativeMarkers.get(id);
  declarativeMarkers.delete(id);
  const start = marker && marker.previousSibling;
  return start &&
    start.nodeType === COMMENT_NODE &&
    start.data === SUSPENSE_PENDING_START_DATA
    ? start
    : null;
}

// Queues one completely parsed <template for> for reveal.
function queueDeclarativePatch(template) {
  const id = template.getAttribute('for');
  if (!DECLARATIVE_FOR.test(id)) {
    return;
  }
  const start = takeDeclarativeBoundary(id);
  if (template.parentNode) {
    template.parentNode.removeChild(template);
  }
  if (start === null) {
    // Dropped with its template.
    return;
  }
  const marker = start.nextSibling;
  let content = template.content;
  // Optional helpers that the server only sends when a patch needs them.
  if (window['$RPN']) {
    content = window['$RPN'](content, marker.parentNode);
  }
  if (window['$RPH']) {
    window['$RPH'](content);
  }
  // The boundaries that are still pending in this content.
  collectDeclarativeMarkers(content);
  // Queued. React must not client render it while it waits for the throttle.
  start.data = SUSPENSE_QUEUED_START_DATA;
  const batch = window['$RB'];
  batch.push(marker, content);
  if (batch.length === 2) {
    // The first patch of a batch schedules its reveal, like $RC does.
    let revealed = false;
    const reveal = () => {
      if (!revealed) {
        revealed = true;
        window['$RV'](batch);
      }
    };
    if (typeof window['$RT'] !== 'number') {
      requestAnimationFrame(reveal);
      // WebKit throttles animation frames in iframes that are not visible.
      setTimeout(reveal, 250);
    } else {
      const currentTime = performance.now();
      const msUntilTimeout =
        currentTime < TARGET_VANITY_METRIC &&
        currentTime > TARGET_VANITY_METRIC - FALLBACK_THROTTLE_MS
          ? TARGET_VANITY_METRIC - currentTime
          : window['$RT'] + FALLBACK_THROTTLE_MS - currentTime;
      // Always a timer, even for a low or negative delay, so that patches that are
      // parsed in the same task make the batch.
      setTimeout(reveal, msUntilTimeout);
    }
  }
}

// Collects the patches among the nodes that were added to the stream. Returns how many
// of the collected patches are known to be complete: the ones before a sentinel.
function collectDeclarativePatches(lists) {
  let complete = 0;
  for (let i = 0; i < lists.length; i++) {
    const added = lists[i].addedNodes;
    for (let j = 0; j < added.length; j++) {
      const node = added[j];
      if (node.nodeType === COMMENT_NODE) {
        if (node.data === '') {
          complete = declarativePatches.length;
        }
      } else if (node.nodeName === 'TEMPLATE') {
        if (node.hasAttribute('for')) {
          declarativePatches.push(node);
        } else if (node.hasAttribute('data-rcr')) {
          // The boundary errored on the server: <template data-rcr id="E:B:n">, which
          // also has the details. Let React client render it, like $RX does.
          const start = takeDeclarativeBoundary(node.id.slice(2));
          if (start !== null) {
            start.data = SUSPENSE_FALLBACK_START_DATA;
            if (start['_reactRetry']) {
              start['_reactRetry']();
            }
          }
        }
      }
    }
  }
  return complete;
}

function queueDeclarativePatches(count) {
  const patches = declarativePatches.splice(0, count);
  for (let i = 0; i < patches.length; i++) {
    queueDeclarativePatch(patches[i]);
  }
}

// $RP. The first call sets up, with the element the stream is appended to when that
// is not the parent of the running script (the external runtime). A later call is
// written after a group of patches in the place of the sentinel.
export function patchDeclarativeBoundaries(root) {
  if (declarativeObserver !== null) {
    collectDeclarativePatches(declarativeObserver.takeRecords());
    queueDeclarativePatches(declarativePatches.length);
    return;
  }
  const script = document.currentScript;
  root = root || (script && script.parentNode) || document.body;
  collectDeclarativeMarkers(document);
  const observer = (declarativeObserver = new MutationObserver(records => {
    queueDeclarativePatches(collectDeclarativePatches(records));
  }));
  observer.observe(root, {childList: true});
  // Patches that were parsed before this ran.
  queueDeclarativePatches(
    collectDeclarativePatches([{addedNodes: root.childNodes}]),
  );
  if (typeof window['$RT'] !== 'number') {
    // Track the paint time of the shell, like markShellTime does for $RC.
    requestAnimationFrame(() => {
      window['$RT'] = performance.now();
    });
  }
  document.addEventListener('DOMContentLoaded', () => {
    // Nothing is still being parsed, and nothing else is coming. Patches that ended
    // up somewhere else in the document are found here too.
    observer.disconnect();
    declarativePatches = [];
    const patches = document.querySelectorAll('template[for]');
    for (let i = 0; i < patches.length; i++) {
      queueDeclarativePatch(patches[i]);
    }
  });
}

// $RPN. Template content is parsed as HTML. For a boundary inside SVG or MathML it has
// to be parsed again in the namespace of its parent (HTML integration points
// excluded). Returns the node that holds the content to insert.
export function fixDeclarativeNamespaces(content, parent) {
  const namespace = parent.namespaceURI;
  const name = parent.localName;
  if (
    !namespace ||
    namespace === XHTML_NAMESPACE ||
    name === 'foreignObject' ||
    name === 'desc' ||
    name === 'title'
  ) {
    return content;
  }
  const holder = document.createElementNS(namespace, name);
  holder.appendChild(content);
  if (namespace === SVG_NAMESPACE) {
    // The HTML parser turned <image> into <img>, which breaks out of SVG when it is
    // parsed again. Turn those back, except in <foreignObject> where <img> is HTML.
    const images = holder.querySelectorAll('img');
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      let ancestor = img.parentNode;
      while (ancestor !== holder && ancestor.localName !== 'foreignobject') {
        ancestor = ancestor.parentNode;
      }
      if (ancestor === holder) {
        const image = document.createElementNS(SVG_NAMESPACE, 'image');
        for (let j = 0; j < img.attributes.length; j++) {
          image.setAttribute(img.attributes[j].name, img.attributes[j].value);
        }
        img.parentNode.replaceChild(image, img);
      }
    }
  }
  holder.innerHTML = holder.innerHTML;
  return holder;
}

// $RPH. Late <style data-precedence> rules arrive inside the patch. Move them to where
// a hoisted style of that precedence belongs: after the last resource with the same
// precedence, or after the last resource of all, like $RR does for a new precedence.
export function hoistDeclarativePatchStyles(content) {
  for (let node = content.firstChild, next; node; node = next) {
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
