import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './icons';
import {
  createLine,
  createRecipe,
  createStep,
  formatDivine,
  lineTotal,
  normalizeCrafts,
  priceLookupKey,
  refreshRecipePrices,
  recipeTotal,
  roundDivineUp,
  stepTotal,
  stepUnitTotal,
} from './model';

const STORAGE_KEY = 'forge-poe2-saved-crafts-v3';
const LEGACY_STORAGE_KEY = 'forge-poe2-crafts-v2';
const PRICES_FILE_UPDATED_AT = __PRICES_UPDATED_AT__;

// Live prices come from the API; the bundled prices.json is the fallback used
// while the API (free Render instance) is asleep or unreachable.
const PRICES_API_URL =
  import.meta.env.VITE_PRICES_API_URL
  || 'https://craft-price-calc-backend.onrender.com/api/prices';
const API_TIMEOUT_MS = 8000;
const API_RETRY_MS = 5000;

const formatUpdatedAt = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
};

const cloneCraft = (craft) => (
  globalThis.structuredClone
    ? globalThis.structuredClone(craft)
    : JSON.parse(JSON.stringify(craft))
);

const loadSavedCrafts = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return normalizeCrafts(JSON.parse(saved));

    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    return legacy ? normalizeCrafts(JSON.parse(legacy)) : [];
  } catch {
    return [];
  }
};

function IconButton({ label, icon, className = '', ...props }) {
  return (
    <button className={`icon-button ${className}`} title={label} aria-label={label} {...props}>
      <Icon name={icon} size={16} />
    </button>
  );
}

function NumberInput({ value, onChange, min = 0, step = 'any', label }) {
  return (
    <input
      aria-label={label}
      className="number-input"
      min={min}
      onChange={(event) => onChange(Number(event.target.value))}
      step={step}
      type="number"
      value={value}
    />
  );
}

function IngredientLine({ line, prices, types, canRemove, onChange, onRemove }) {
  const items = prices.get(line.type) ?? [];

  const selectType = (type) => onChange({ ...line, type, item: '', price: 0 });
  const selectItem = (itemName) => {
    const item = items.find((candidate) => candidate.Name === itemName);
    onChange({ ...line, item: itemName, price: Number(item?.Price) || 0 });
  };

  return (
    <div className="ingredient-row">
      <div className="field type-field">
        <label>Type</label>
        <select value={line.type} onChange={(event) => selectType(event.target.value)}>
          <option value="">Select</option>
          {types.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </div>

      <div className="field item-field">
        <label>Item</label>
        <select
          disabled={!line.type}
          value={line.item}
          onChange={(event) => selectItem(event.target.value)}
        >
          <option value="">{line.type ? 'Select item' : 'Choose a type first'}</option>
          {items.map((item) => <option key={`${item.Id}-${item.Name}`} value={item.Name}>{item.Name}</option>)}
        </select>
      </div>

      <div className="field qty-field">
        <label>Qty</label>
        <NumberInput
          label="Quantity"
          min={0}
          value={line.qty}
          onChange={(qty) => onChange({ ...line, qty: Number.isFinite(qty) ? qty : 0 })}
        />
      </div>

      <div className="value-cell unit-value">
        <span>Unit</span>
        <strong>{formatDivine(line.price)}</strong>
      </div>

      <div className="value-cell line-value">
        <span>Total</span>
        <strong>{formatDivine(lineTotal(line))}</strong>
      </div>

      <div className="remove-cell">
        <IconButton
          className="danger"
          disabled={!canRemove}
          icon="trash"
          label="Remove item from step"
          onClick={onRemove}
          type="button"
        />
      </div>
    </div>
  );
}

function StepCard({ step, index, prices, types, isCollapsed, onChange, onRemove, onToggleCollapse }) {
  const updateLine = (lineIndex, nextLine) => {
    const lines = step.lines.map((line, currentIndex) => currentIndex === lineIndex ? nextLine : line);
    onChange({ ...step, lines });
  };

  const removeLine = (lineIndex) => {
    if (step.lines.length === 1) return;
    onChange({ ...step, lines: step.lines.filter((_, currentIndex) => currentIndex !== lineIndex) });
  };

  const updateRepetitions = (delta) => {
    onChange({ ...step, repetitions: Math.max(1, step.repetitions + delta) });
  };

  const itemSummary = step.lines
    .map((line) => {
      const name = line.item || line.type || 'No item selected';
      return Number(line.qty) !== 1 ? `${line.qty}× ${name}` : name;
    })
    .join(' + ');

  return (
    <article className={`step-card${isCollapsed ? ' collapsed' : ''}`}>
      <header className="step-header">
        <div className="step-identity">
          <span className="step-number">{index + 1}</span>
          <div>
            <p>Step {index + 1}</p>
            <span>{step.lines.length > 1 ? `${step.lines.length} combined items` : 'Single action'}</span>
          </div>
        </div>

        {isCollapsed && (
          <div className="collapsed-summary">
            <strong title={itemSummary}>{itemSummary}</strong>
            {step.comment && <span title={step.comment}>{step.comment}</span>}
          </div>
        )}

        <div className="step-actions">
          {isCollapsed ? (
            <>
              <span className="collapsed-repeat" title={`${step.repetitions} runs`}>
                <Icon name="repeat" size={13} />
                {step.repetitions}×
              </span>
              <span className="collapsed-total">
                <strong>{formatDivine(stepTotal(step))}</strong>
                <small>Divine</small>
              </span>
            </>
          ) : (
            <div className="repeat-control" aria-label="Number of step runs">
              <Icon name="repeat" size={15} />
              <span className="repeat-label">Runs</span>
              <IconButton
                disabled={step.repetitions === 1}
                icon="minus"
                label="Remove one repetition"
                onClick={() => updateRepetitions(-1)}
                type="button"
              />
              <strong>{step.repetitions}×</strong>
              <IconButton
                icon="plus"
                label="Repeat step once more"
                onClick={() => updateRepetitions(1)}
                type="button"
              />
            </div>
          )}
          <IconButton
            aria-expanded={!isCollapsed}
            className={`collapse-toggle${isCollapsed ? '' : ' expanded'}`}
            icon="chevron"
            label={isCollapsed ? `Expand step ${index + 1}` : `Collapse step ${index + 1}`}
            onClick={onToggleCollapse}
            type="button"
          />
          <IconButton
            className="danger remove-step"
            icon="trash"
            label={`Delete step ${index + 1}`}
            onClick={onRemove}
            type="button"
          />
        </div>
      </header>

      <div className="step-expandable" aria-hidden={isCollapsed}>
        <div className="step-expandable-inner">
          <div className="ingredients">
            {step.lines.map((line, lineIndex) => (
              <IngredientLine
                canRemove={step.lines.length > 1}
                key={line.id}
                line={line}
                onChange={(nextLine) => updateLine(lineIndex, nextLine)}
                onRemove={() => removeLine(lineIndex)}
                prices={prices}
                types={types}
              />
            ))}
          </div>

          <div className="step-footer">
            <button
              className="add-combination"
              onClick={() => onChange({ ...step, lines: [...step.lines, createLine()] })}
              type="button"
            >
              <Icon name="plus" size={15} />
              Combine item
            </button>

            <label className="comment-field">
              <Icon name="comment" size={15} />
              <input
                maxLength={160}
                onChange={(event) => onChange({ ...step, comment: event.target.value })}
                placeholder="Comment for this step (optional)"
                type="text"
                value={step.comment}
              />
            </label>

            <div className="step-subtotal">
              {step.repetitions > 1 && (
                <span>{formatDivine(stepUnitTotal(step))} × {step.repetitions}</span>
              )}
              <strong>{formatDivine(stepTotal(step))} <small>Divine</small></strong>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function RecipeCard({ recipe, prices, types, isDirty, onChange, onSave }) {
  const [collapsedStepIds, setCollapsedStepIds] = useState(() => new Set());

  const updateStep = (stepIndex, nextStep) => {
    const steps = recipe.steps.map((step, currentIndex) => currentIndex === stepIndex ? nextStep : step);
    onChange({ ...recipe, steps });
  };

  const removeStep = (stepIndex) => {
    const removedStepId = recipe.steps[stepIndex]?.id;
    setCollapsedStepIds((current) => {
      const next = new Set(current);
      next.delete(removedStepId);
      return next;
    });
    onChange({ ...recipe, steps: recipe.steps.filter((_, currentIndex) => currentIndex !== stepIndex) });
  };

  const toggleStepCollapse = (stepId) => {
    setCollapsedStepIds((current) => {
      const next = new Set(current);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  };

  const addStep = () => {
    const previousStep = recipe.steps[recipe.steps.length - 1];
    if (previousStep) {
      setCollapsedStepIds((current) => new Set(current).add(previousStep.id));
    }
    onChange({ ...recipe, steps: [...recipe.steps, createStep()] });
  };

  return (
    <section className="recipe-card">
      <header className="recipe-header">
        <div className="recipe-title">
          <span className="recipe-index">Current craft</span>
          <input
            aria-label="Recipe name"
            maxLength={80}
            onChange={(event) => onChange({ ...recipe, name: event.target.value })}
            value={recipe.name}
          />
        </div>
        <div className="recipe-save-area">
          <span className={`save-state${isDirty ? ' dirty' : ''}`}>
            <i /> {isDirty ? 'Unsaved changes' : 'Saved'}
          </span>
          <button className="save-button" disabled={!isDirty} onClick={onSave} type="button">
            <Icon name="save" size={16} />
            Save
          </button>
        </div>
      </header>

      <div className="recipe-content">
        <div className="base-row">
          <div className="base-badge">Base</div>
          <label className="base-name">
            <span>Base item</span>
            <input
              onChange={(event) => onChange({
                ...recipe,
                base: { ...recipe.base, item: event.target.value },
              })}
              placeholder="e.g. Expert Feathered Sandals"
              type="text"
              value={recipe.base.item}
            />
          </label>
          <label className="base-price">
            <span>Base price</span>
            <div>
              <NumberInput
                label="Base price in Divine"
                min={0}
                step={0.01}
                value={recipe.base.price}
                onChange={(price) => onChange({
                  ...recipe,
                  base: { ...recipe.base, price: Number.isFinite(price) ? roundDivineUp(price) : 0 },
                })}
              />
              <em>Divine</em>
            </div>
          </label>
        </div>

        <div className="steps-list">
          {recipe.steps.map((step, stepIndex) => (
            <StepCard
              index={stepIndex}
              isCollapsed={collapsedStepIds.has(step.id)}
              key={step.id}
              onChange={(nextStep) => updateStep(stepIndex, nextStep)}
              onRemove={() => removeStep(stepIndex)}
              onToggleCollapse={() => toggleStepCollapse(step.id)}
              prices={prices}
              step={step}
              types={types}
            />
          ))}
        </div>

        <div className="recipe-bottom">
          <button
            className="add-step"
            onClick={addStep}
            type="button"
          >
            <span><Icon name="plus" size={18} /></span>
            Add step
          </button>

          <div className="recipe-total">
            <span>Estimated cost</span>
            <strong>{formatDivine(recipeTotal(recipe))}</strong>
            <em>Divine</em>
          </div>
        </div>
      </div>
    </section>
  );
}

function EmptyState({ onCreate }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Icon name="layers" size={30} /></div>
      <h2>Your workbench is empty</h2>
      <p>Create or load a craft to build the steps and calculate the total cost.</p>
      <button className="primary-button" onClick={onCreate} type="button">
        <Icon name="plus" />
        Create first craft
      </button>
    </div>
  );
}

function SavedCraftsSidebar({ crafts, activeCraftId, onLoad, onDelete }) {
  return (
    <aside className="craft-library">
      <div className="library-header">
        <div>
          <span>Library</span>
          <h2>Saved crafts</h2>
        </div>
        <span className="library-count">{crafts.length}</span>
      </div>

      <div className="saved-craft-list">
        {crafts.length === 0 ? (
          <div className="library-empty">
            <Icon name="folder" size={22} />
            <p>No crafts saved yet.</p>
            <span>Use the Save button on the current craft.</span>
          </div>
        ) : crafts.map((craft) => (
          <article className={`saved-craft-card${activeCraftId === craft.id ? ' active' : ''}`} key={craft.id}>
            <button className="saved-craft-main" onClick={() => onLoad(craft)} type="button">
              <strong>{craft.name}</strong>
              <span>
                <b>{formatDivine(recipeTotal(craft))} Divine</b>
                <em>{craft.steps.length} {craft.steps.length === 1 ? 'step' : 'steps'}</em>
              </span>
            </button>
            <IconButton
              className="danger saved-craft-delete"
              icon="trash"
              label={`Delete craft ${craft.name}`}
              onClick={() => onDelete(craft.id)}
              type="button"
            />
          </article>
        ))}
      </div>
    </aside>
  );
}

function UnsavedChangesModal({ craftName, onSave, onDiscard, onCancel }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        aria-labelledby="unsaved-title"
        aria-modal="true"
        className="unsaved-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="modal-icon"><Icon name="save" size={22} /></div>
        <span className="eyebrow">Unsaved changes</span>
        <h2 id="unsaved-title">Save before continuing?</h2>
        <p>The craft <strong>{craftName}</strong> has been changed. Do you want to save it before opening another one?</p>
        <div className="modal-actions">
          <button className="modal-cancel" onClick={onCancel} type="button">Cancel</button>
          <button className="modal-discard" onClick={onDiscard} type="button">Discard</button>
          <button className="primary-button" onClick={onSave} type="button">
            <Icon name="save" size={16} />
            Save and open
          </button>
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const [savedCrafts, setSavedCrafts] = useState(loadSavedCrafts);
  const [activeCraft, setActiveCraft] = useState(null);
  const [pendingCraft, setPendingCraft] = useState(null);
  const [priceData, setPriceData] = useState([]);
  const [priceStatus, setPriceStatus] = useState({
    state: 'loading',
    message: 'Loading prices',
    updatedAt: null,
  });
  const [recipeName, setRecipeName] = useState('');
  const [notice, setNotice] = useState(null);
  const importRef = useRef(null);

  useEffect(() => {
    let active = true;
    let retryTimer = null;
    let fallbackLoaded = false;

    // Bundled prices.json — used while the API is asleep/unreachable so the page
    // always has something usable to show.
    const loadFallback = async () => {
      if (fallbackLoaded) return;
      try {
        const response = await fetch(`/prices.json?v=${Date.now()}`, {
          cache: 'no-store',
          headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        });
        if (!response.ok) throw new Error('fallback failed');
        const data = await response.json();
        if (!active) return;
        fallbackLoaded = true;
        setPriceData((current) => (current.length ? current : data));
      } catch {
        // Ignore: the API retry loop keeps the "updating" notice on screen.
      }
    };

    const fetchApi = async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
      try {
        const response = await fetch(PRICES_API_URL, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error(`status ${response.status}`);
        return await response.json();
      } finally {
        clearTimeout(timeout);
      }
    };

    // Tries the API; on failure shows the bundled prices + a notice and keeps
    // retrying in the background until the API wakes up.
    const attemptApi = async () => {
      try {
        const data = await fetchApi();
        if (!active) return;
        if (!Array.isArray(data) || data.length === 0) throw new Error('empty');

        setPriceData(data);
        setPriceStatus({
          state: 'success',
          message: `${data.length.toLocaleString('en-US')} items updated`,
          updatedAt: formatUpdatedAt(new Date().toISOString()),
        });
      } catch {
        if (!active) return;
        await loadFallback();
        if (!active) return;
        setPriceStatus({
          state: 'updating',
          message: 'Updating prices…',
          updatedAt: formatUpdatedAt(PRICES_FILE_UPDATED_AT),
        });
        retryTimer = setTimeout(attemptApi, API_RETRY_MS);
      }
    };

    // Show the bundled prices right away, then try to upgrade to live data.
    loadFallback();
    attemptApi();

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, crafts: savedCrafts }));
  }, [savedCrafts]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timeout);
  }, [notice]);

  const pricesByType = useMemo(() => {
    const result = new Map();
    priceData.forEach((item) => {
      const items = result.get(item.Source) ?? [];
      items.push(item);
      result.set(item.Source, items);
    });
    result.forEach((items) => items.sort((a, b) => a.Name.localeCompare(b.Name)));
    return result;
  }, [priceData]);

  const latestPrices = useMemo(() => new Map(
    priceData.map((item) => [priceLookupKey(item.Source, item.Name), item.Price]),
  ), [priceData]);

  useEffect(() => {
    if (latestPrices.size === 0) return;

    setSavedCrafts((current) => {
      let changed = false;
      const refreshed = current.map((craft) => {
        const nextCraft = refreshRecipePrices(craft, latestPrices);
        if (nextCraft !== craft) changed = true;
        return nextCraft;
      });
      return changed ? refreshed : current;
    });

    setActiveCraft((current) => (
      current ? refreshRecipePrices(current, latestPrices) : current
    ));
  }, [latestPrices]);

  const types = useMemo(() => [...pricesByType.keys()].sort(), [pricesByType]);
  const currentTotal = activeCraft ? recipeTotal(activeCraft) : 0;
  const savedVersion = activeCraft
    ? savedCrafts.find((craft) => craft.id === activeCraft.id)
    : null;
  const isDirty = Boolean(
    activeCraft && (!savedVersion || JSON.stringify(activeCraft) !== JSON.stringify(savedVersion)),
  );

  const openCraft = (craft) => setActiveCraft(cloneCraft(craft));

  const requestOpenCraft = (craft) => {
    if (activeCraft?.id === craft.id) return;
    if (isDirty) setPendingCraft(craft);
    else openCraft(craft);
  };

  const addRecipe = () => {
    const name = recipeName.trim();
    if (!name) return;
    const nextCraft = createRecipe(name);
    setRecipeName('');
    if (isDirty) setPendingCraft(nextCraft);
    else openCraft(nextCraft);
  };

  const createPlaceholderRecipe = () => {
    const nextCraft = createRecipe('New recipe');
    if (isDirty) setPendingCraft(nextCraft);
    else openCraft(nextCraft);
  };

  const saveActiveCraft = () => {
    if (!activeCraft) return;
    const snapshot = cloneCraft({
      ...activeCraft,
      name: activeCraft.name.trim() || 'Untitled craft',
    });
    setActiveCraft(snapshot);
    setSavedCrafts((current) => {
      const exists = current.some((craft) => craft.id === snapshot.id);
      return exists
        ? current.map((craft) => craft.id === snapshot.id ? snapshot : craft)
        : [snapshot, ...current];
    });
    setNotice({ state: 'success', message: 'Craft saved to library' });
  };

  const saveAndContinue = () => {
    if (!pendingCraft) return;
    saveActiveCraft();
    openCraft(pendingCraft);
    setPendingCraft(null);
  };

  const discardAndContinue = () => {
    if (!pendingCraft) return;
    openCraft(pendingCraft);
    setPendingCraft(null);
  };

  const deleteSavedCraft = (craftId) => {
    setSavedCrafts((current) => current.filter((craft) => craft.id !== craftId));
    setNotice({ state: 'success', message: 'Craft removed from library' });
  };

  const exportCrafts = () => {
    const payload = { version: 3, exportedAt: new Date().toISOString(), crafts: savedCrafts };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'poe2-crafts.json';
    link.click();
    URL.revokeObjectURL(link.href);
    setNotice({ state: 'success', message: 'Crafts exported' });
  };

  const importCrafts = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = normalizeCrafts(JSON.parse(await file.text()));
      setSavedCrafts((current) => [...imported, ...current]);
      if (imported[0]) requestOpenCraft(imported[0]);
      setNotice({ state: 'success', message: `${imported.length} craft(s) added to the library` });
    } catch (error) {
      setNotice({ state: 'error', message: error.message || 'Invalid recipes file' });
    } finally {
      event.target.value = '';
    }
  };

  return (
    <div className="app-shell">
      <nav className="topbar">
        <a className="brand" href="#top" aria-label="Forge — home">
          <span className="brand-mark"><Icon name="hammer" size={22} /></span>
          <span><strong>FORGE</strong><small>PoE2 Craft Calculator</small></span>
        </a>

        <div className={`price-status ${priceStatus.state}`}>
          <span className="status-dot" />
          <span>
            <strong>{priceStatus.message}</strong>
            {priceStatus.updatedAt && <small>Updated at {priceStatus.updatedAt}</small>}
          </span>
        </div>
      </nav>

      <main id="top">
        {priceStatus.state === 'updating' && (
          <div className="update-banner" role="status">
            <span className="update-spinner" aria-hidden="true" />
            <p>
              <strong>Prices are updating and will be available shortly.</strong>
              <span>Showing the latest saved prices for now — live data loads automatically once the server is awake.</span>
            </p>
          </div>
        )}

        <section className="hero">
          <div>
            <span className="eyebrow">Craft workbench</span>
            <h1>Plan the craft.<br /> <em>Know the cost.</em></h1>
          </div>

          <div className="summary-card">
            <span>Current craft total</span>
            <div><strong>{formatDivine(currentTotal)}</strong><em>Divine</em></div>
            <small>{activeCraft ? `${activeCraft.steps.length} ${activeCraft.steps.length === 1 ? 'step' : 'steps'}` : 'No craft open'}</small>
          </div>
        </section>

        <section className="toolbar-panel">
          <div className="new-recipe-field">
            <label htmlFor="recipe-name">New craft</label>
            <div>
              <input
                id="recipe-name"
                maxLength={80}
                onChange={(event) => setRecipeName(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') addRecipe(); }}
                placeholder="e.g. Spirit Boots"
                type="text"
                value={recipeName}
              />
              <button className="primary-button" disabled={!recipeName.trim()} onClick={addRecipe} type="button">
                <Icon name="plus" />
                Create craft
              </button>
            </div>
          </div>

          <div className="file-actions">
            <button disabled={!savedCrafts.length} onClick={exportCrafts} type="button">
              <Icon name="download" />
              Export
            </button>
            <button onClick={() => importRef.current?.click()} type="button">
              <Icon name="upload" />
              Import
            </button>
            <input accept="application/json,.json" hidden onChange={importCrafts} ref={importRef} type="file" />
          </div>
        </section>

        <div className="workspace-layout">
          <SavedCraftsSidebar
            activeCraftId={activeCraft?.id}
            crafts={savedCrafts}
            onDelete={deleteSavedCraft}
            onLoad={requestOpenCraft}
          />

          <div className="recipe-list">
            {activeCraft ? (
            <RecipeCard
              isDirty={isDirty}
              key={activeCraft.id}
              onChange={setActiveCraft}
              onSave={saveActiveCraft}
              prices={pricesByType}
              recipe={activeCraft}
              types={types}
            />
            ) : (
              <EmptyState onCreate={createPlaceholderRecipe} />
            )}
          </div>
        </div>

        <footer>
          <span><Icon name="hammer" size={15} /> Forge</span>
          <p>Values are estimates based on the current price data.</p>
        </footer>
      </main>

      {notice && (
        <div className={`toast ${notice.state}`} role="status">
          <Icon name={notice.state === 'success' ? 'check' : 'alert'} />
          {notice.message}
        </div>
      )}

      {pendingCraft && activeCraft && (
        <UnsavedChangesModal
          craftName={activeCraft.name || 'Untitled craft'}
          onCancel={() => setPendingCraft(null)}
          onDiscard={discardAndContinue}
          onSave={saveAndContinue}
        />
      )}
    </div>
  );
}
