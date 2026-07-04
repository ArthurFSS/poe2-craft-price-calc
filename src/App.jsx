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
  stepTotal,
  stepUnitTotal,
} from './model';

const STORAGE_KEY = 'forge-poe2-crafts-v2';

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

function StepCard({ step, index, prices, types, onChange, onRemove }) {
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

  return (
    <article className="step-card">
      <header className="step-header">
        <div className="step-identity">
          <span className="step-number">{index + 1}</span>
          <div>
            <p>Etapa {index + 1}</p>
            <span>{step.lines.length > 1 ? `${step.lines.length} itens combinados` : 'Ação individual'}</span>
          </div>
        </div>

        <div className="step-actions">
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
          <IconButton
            className="danger remove-step"
            icon="trash"
            label={`Excluir etapa ${index + 1}`}
            onClick={onRemove}
            type="button"
          />
        </div>
      </header>

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
    </article>
  );
}

function RecipeCard({ recipe, index, prices, types, onChange, onRemove }) {
  const updateStep = (stepIndex, nextStep) => {
    const steps = recipe.steps.map((step, currentIndex) => currentIndex === stepIndex ? nextStep : step);
    onChange({ ...recipe, steps });
  };

  const removeStep = (stepIndex) => {
    onChange({ ...recipe, steps: recipe.steps.filter((_, currentIndex) => currentIndex !== stepIndex) });
  };

  return (
    <section className="recipe-card">
      <header className="recipe-header">
        <div className="recipe-title">
          <span className="recipe-index">Receita {String(index + 1).padStart(2, '0')}</span>
          <input
            aria-label="Nome da receita"
            maxLength={80}
            onChange={(event) => onChange({ ...recipe, name: event.target.value })}
            value={recipe.name}
          />
        </div>
        <button className="delete-recipe" onClick={onRemove} type="button">
          <Icon name="trash" size={16} />
          <span>Excluir receita</span>
        </button>
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
                value={recipe.base.price}
                onChange={(price) => onChange({
                  ...recipe,
                  base: { ...recipe.base, price: Number.isFinite(price) ? price : 0 },
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
              key={step.id}
              onChange={(nextStep) => updateStep(stepIndex, nextStep)}
              onRemove={() => removeStep(stepIndex)}
              prices={prices}
              step={step}
              types={types}
            />
          ))}
        </div>

        <div className="recipe-bottom">
          <button
            className="add-step"
            onClick={() => onChange({ ...recipe, steps: [...recipe.steps, createStep()] })}
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
      <p>Crie uma receita para montar as etapas e calcular o custo total do craft.</p>
      <button className="primary-button" onClick={onCreate} type="button">
        <Icon name="plus" />
        Criar primeira receita
      </button>
    </div>
  );
}

export default function App() {
  const [crafts, setCrafts] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? normalizeCrafts(JSON.parse(saved)) : [];
    } catch {
      return [];
    }
  });
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, crafts }));
  }, [crafts]);

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
  const grandTotal = useMemo(() => crafts.reduce((sum, craft) => sum + recipeTotal(craft), 0), [crafts]);

  const addRecipe = () => {
    const name = recipeName.trim();
    if (!name) return;
    setCrafts((current) => [...current, createRecipe(name)]);
    setRecipeName('');
  };

  const createPlaceholderRecipe = () => {
    setCrafts((current) => [...current, createRecipe('Nova receita')]);
  };

  const updateRecipe = (index, nextRecipe) => {
    setCrafts((current) => current.map((recipe, currentIndex) => currentIndex === index ? nextRecipe : recipe));
  };

  const removeRecipe = (index) => {
    setCrafts((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const exportCrafts = () => {
    const payload = { version: 2, exportedAt: new Date().toISOString(), crafts };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'poe2-crafts.json';
    link.click();
    URL.revokeObjectURL(link.href);
    setNotice({ state: 'success', message: 'Receitas exportadas' });
  };

  const importCrafts = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = normalizeCrafts(JSON.parse(await file.text()));
      setCrafts(imported);
      setNotice({ state: 'success', message: `${imported.length} receita(s) importada(s)` });
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
            <p>Organize materiais em etapas, combine itens e simule cada repetição antes de gastar.</p>
          </div>

          <div className="summary-card">
            <span>Total do projeto</span>
            <div><strong>{formatDivine(grandTotal)}</strong><em>Divine</em></div>
            <small>{crafts.length} {crafts.length === 1 ? 'receita ativa' : 'receitas ativas'}</small>
          </div>
        </section>

        <section className="toolbar-panel">
          <div className="new-recipe-field">
            <label htmlFor="recipe-name">Nova receita</label>
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
                Criar receita
              </button>
            </div>
          </div>

          <div className="file-actions">
            <button disabled={!crafts.length} onClick={exportCrafts} type="button">
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

        <div className="recipe-list">
          {crafts.length === 0 ? (
            <EmptyState onCreate={createPlaceholderRecipe} />
          ) : crafts.map((recipe, index) => (
            <RecipeCard
              index={index}
              key={recipe.id}
              onChange={(nextRecipe) => updateRecipe(index, nextRecipe)}
              onRemove={() => removeRecipe(index)}
              prices={pricesByType}
              recipe={recipe}
              types={types}
            />
          ))}
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
    </div>
  );
}
