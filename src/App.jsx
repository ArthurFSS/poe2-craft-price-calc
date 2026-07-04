import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './icons';
import {
  createLine,
  createRecipe,
  createStep,
  formatDivine,
  lineTotal,
  normalizeCrafts,
  recipeTotal,
  roundDivineUp,
  stepTotal,
  stepUnitTotal,
} from './model';

const STORAGE_KEY = 'forge-poe2-saved-crafts-v3';
const LEGACY_STORAGE_KEY = 'forge-poe2-crafts-v2';

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
        <label>Tipo</label>
        <select value={line.type} onChange={(event) => selectType(event.target.value)}>
          <option value="">Selecione</option>
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
          <option value="">{line.type ? 'Selecione o item' : 'Escolha um tipo primeiro'}</option>
          {items.map((item) => <option key={`${item.Id}-${item.Name}`} value={item.Name}>{item.Name}</option>)}
        </select>
      </div>

      <div className="field qty-field">
        <label>Qtd.</label>
        <NumberInput
          label="Quantidade"
          min={0}
          value={line.qty}
          onChange={(qty) => onChange({ ...line, qty: Number.isFinite(qty) ? qty : 0 })}
        />
      </div>

      <div className="value-cell unit-value">
        <span>Unitário</span>
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
          label="Remover item da etapa"
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
      const name = line.item || line.type || 'Item não selecionado';
      return Number(line.qty) !== 1 ? `${line.qty}× ${name}` : name;
    })
    .join(' + ');

  return (
    <article className={`step-card${isCollapsed ? ' collapsed' : ''}`}>
      <header className="step-header">
        <div className="step-identity">
          <span className="step-number">{index + 1}</span>
          <div>
            <p>Etapa {index + 1}</p>
            <span>{step.lines.length > 1 ? `${step.lines.length} itens combinados` : 'Ação individual'}</span>
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
              <span className="collapsed-repeat" title={`${step.repetitions} execuções`}>
                <Icon name="repeat" size={13} />
                {step.repetitions}×
              </span>
              <span className="collapsed-total">
                <strong>{formatDivine(stepTotal(step))}</strong>
                <small>Divine</small>
              </span>
            </>
          ) : (
            <div className="repeat-control" aria-label="Número de execuções da etapa">
              <Icon name="repeat" size={15} />
              <span className="repeat-label">Execuções</span>
              <IconButton
                disabled={step.repetitions === 1}
                icon="minus"
                label="Remover uma repetição"
                onClick={() => updateRepetitions(-1)}
                type="button"
              />
              <strong>{step.repetitions}×</strong>
              <IconButton
                icon="plus"
                label="Repetir etapa mais uma vez"
                onClick={() => updateRepetitions(1)}
                type="button"
              />
            </div>
          )}
          <IconButton
            aria-expanded={!isCollapsed}
            className={`collapse-toggle${isCollapsed ? '' : ' expanded'}`}
            icon="chevron"
            label={isCollapsed ? `Expandir etapa ${index + 1}` : `Minimizar etapa ${index + 1}`}
            onClick={onToggleCollapse}
            type="button"
          />
          <IconButton
            className="danger remove-step"
            icon="trash"
            label={`Excluir etapa ${index + 1}`}
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
              Combinar item
            </button>

            <label className="comment-field">
              <Icon name="comment" size={15} />
              <input
                maxLength={160}
                onChange={(event) => onChange({ ...step, comment: event.target.value })}
                placeholder="Comentário desta etapa (opcional)"
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
          <span className="recipe-index">Craft atual</span>
          <input
            aria-label="Nome da receita"
            maxLength={80}
            onChange={(event) => onChange({ ...recipe, name: event.target.value })}
            value={recipe.name}
          />
        </div>
        <div className="recipe-save-area">
          <span className={`save-state${isDirty ? ' dirty' : ''}`}>
            <i /> {isDirty ? 'Alterações não salvas' : 'Salvo'}
          </span>
          <button className="save-button" disabled={!isDirty} onClick={onSave} type="button">
            <Icon name="save" size={16} />
            Salvar
          </button>
        </div>
      </header>

      <div className="recipe-content">
        <div className="base-row">
          <div className="base-badge">Base</div>
          <label className="base-name">
            <span>Item base</span>
            <input
              onChange={(event) => onChange({
                ...recipe,
                base: { ...recipe.base, item: event.target.value },
              })}
              placeholder="Ex.: Expert Feathered Sandals"
              type="text"
              value={recipe.base.item}
            />
          </label>
          <label className="base-price">
            <span>Preço da base</span>
            <div>
              <NumberInput
                label="Preço da base em Divine"
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
            Adicionar etapa
          </button>

          <div className="recipe-total">
            <span>Custo estimado</span>
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
      <h2>Sua bancada está vazia</h2>
      <p>Crie ou carregue um craft para montar as etapas e calcular o custo total.</p>
      <button className="primary-button" onClick={onCreate} type="button">
        <Icon name="plus" />
        Criar primeiro craft
      </button>
    </div>
  );
}

function SavedCraftsSidebar({ crafts, activeCraftId, onLoad, onDelete }) {
  return (
    <aside className="craft-library">
      <div className="library-header">
        <div>
          <span>Biblioteca</span>
          <h2>Crafts salvos</h2>
        </div>
        <span className="library-count">{crafts.length}</span>
      </div>

      <div className="saved-craft-list">
        {crafts.length === 0 ? (
          <div className="library-empty">
            <Icon name="folder" size={22} />
            <p>Nenhum craft salvo ainda.</p>
            <span>Use o botão Salvar no craft atual.</span>
          </div>
        ) : crafts.map((craft) => (
          <article className={`saved-craft-card${activeCraftId === craft.id ? ' active' : ''}`} key={craft.id}>
            <button className="saved-craft-main" onClick={() => onLoad(craft)} type="button">
              <strong>{craft.name}</strong>
              <span>
                <b>{formatDivine(recipeTotal(craft))} Divine</b>
                <em>{craft.steps.length} {craft.steps.length === 1 ? 'etapa' : 'etapas'}</em>
              </span>
            </button>
            <IconButton
              className="danger saved-craft-delete"
              icon="trash"
              label={`Excluir craft ${craft.name}`}
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
        <span className="eyebrow">Alterações não salvas</span>
        <h2 id="unsaved-title">Salvar antes de continuar?</h2>
        <p>O craft <strong>{craftName}</strong> foi alterado. Você deseja salvá-lo antes de abrir outro?</p>
        <div className="modal-actions">
          <button className="modal-cancel" onClick={onCancel} type="button">Cancelar</button>
          <button className="modal-discard" onClick={onDiscard} type="button">Descartar</button>
          <button className="primary-button" onClick={onSave} type="button">
            <Icon name="save" size={16} />
            Salvar e abrir
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
  const [priceStatus, setPriceStatus] = useState({ state: 'loading', message: 'Carregando preços' });
  const [recipeName, setRecipeName] = useState('');
  const [notice, setNotice] = useState(null);
  const importRef = useRef(null);

  useEffect(() => {
    let active = true;
    fetch(`/prices.json?_=${Date.now()}`)
      .then((response) => {
        if (!response.ok) throw new Error('Falha ao carregar');
        return response.json();
      })
      .then((data) => {
        if (!active) return;
        setPriceData(data);
        setPriceStatus({ state: 'success', message: `${data.length.toLocaleString('pt-BR')} itens atualizados` });
      })
      .catch(() => {
        if (!active) return;
        setPriceStatus({ state: 'error', message: 'Preços indisponíveis' });
      });
    return () => { active = false; };
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
    const nextCraft = createRecipe('Nova receita');
    if (isDirty) setPendingCraft(nextCraft);
    else openCraft(nextCraft);
  };

  const saveActiveCraft = () => {
    if (!activeCraft) return;
    const snapshot = cloneCraft({
      ...activeCraft,
      name: activeCraft.name.trim() || 'Craft sem nome',
    });
    setActiveCraft(snapshot);
    setSavedCrafts((current) => {
      const exists = current.some((craft) => craft.id === snapshot.id);
      return exists
        ? current.map((craft) => craft.id === snapshot.id ? snapshot : craft)
        : [snapshot, ...current];
    });
    setNotice({ state: 'success', message: 'Craft salvo na biblioteca' });
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
    setNotice({ state: 'success', message: 'Craft removido da biblioteca' });
  };

  const exportCrafts = () => {
    const payload = { version: 3, exportedAt: new Date().toISOString(), crafts: savedCrafts };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'poe2-crafts.json';
    link.click();
    URL.revokeObjectURL(link.href);
    setNotice({ state: 'success', message: 'Crafts exportados' });
  };

  const importCrafts = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = normalizeCrafts(JSON.parse(await file.text()));
      setSavedCrafts((current) => [...imported, ...current]);
      if (imported[0]) requestOpenCraft(imported[0]);
      setNotice({ state: 'success', message: `${imported.length} craft(s) adicionado(s) à biblioteca` });
    } catch (error) {
      setNotice({ state: 'error', message: error.message || 'Arquivo de receitas inválido' });
    } finally {
      event.target.value = '';
    }
  };

  return (
    <div className="app-shell">
      <nav className="topbar">
        <a className="brand" href="#top" aria-label="Forge — início">
          <span className="brand-mark"><Icon name="hammer" size={22} /></span>
          <span><strong>FORGE</strong><small>PoE2 Craft Calculator</small></span>
        </a>

        <div className={`price-status ${priceStatus.state}`}>
          <span className="status-dot" />
          {priceStatus.message}
        </div>
      </nav>

      <main id="top">
        <section className="hero">
          <div>
            <span className="eyebrow">Bancada de craft</span>
            <h1>Planeje o craft.<br /> <em>Conheça o custo.</em></h1>
          </div>

          <div className="summary-card">
            <span>Total do craft atual</span>
            <div><strong>{formatDivine(currentTotal)}</strong><em>Divine</em></div>
            <small>{activeCraft ? `${activeCraft.steps.length} ${activeCraft.steps.length === 1 ? 'etapa' : 'etapas'}` : 'Nenhum craft aberto'}</small>
          </div>
        </section>

        <section className="toolbar-panel">
          <div className="new-recipe-field">
            <label htmlFor="recipe-name">Novo craft</label>
            <div>
              <input
                id="recipe-name"
                maxLength={80}
                onChange={(event) => setRecipeName(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') addRecipe(); }}
                placeholder="Ex.: Botas de Spirit"
                type="text"
                value={recipeName}
              />
              <button className="primary-button" disabled={!recipeName.trim()} onClick={addRecipe} type="button">
                <Icon name="plus" />
                Criar craft
              </button>
            </div>
          </div>

          <div className="file-actions">
            <button disabled={!savedCrafts.length} onClick={exportCrafts} type="button">
              <Icon name="download" />
              Exportar
            </button>
            <button onClick={() => importRef.current?.click()} type="button">
              <Icon name="upload" />
              Importar
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
          <p>Os valores são estimativas baseadas no arquivo de preços atual.</p>
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
          craftName={activeCraft.name || 'Craft sem nome'}
          onCancel={() => setPendingCraft(null)}
          onDiscard={discardAndContinue}
          onSave={saveAndContinue}
        />
      )}
    </div>
  );
}
