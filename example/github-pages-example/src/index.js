import './styles.css';

const API_URL = 'api/recipes.json';

let allRecipes = [];
let categories = [];

async function loadRecipes() {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch recipes: ${response.statusText}`);
    }

    const api = await response.json();
    categories = api.categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      description: cat.description,
    }));
    allRecipes = api.categories.flatMap((cat) =>
      cat.recipes.map((recipe) => ({ ...recipe, categoryName: cat.name }))
    );

    populateCategoryFilter();
    updateStats(api.lastUpdated);
    renderRecipes(allRecipes);

    document.getElementById('loading').style.display = 'none';
  } catch (error) {
    console.error(error);
    document.getElementById('loading').style.display = 'none';
    document.getElementById('error').style.display = 'block';
  }
}

function populateCategoryFilter() {
  const select = document.getElementById('categoryFilter');
  for (const category of categories) {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    select.appendChild(option);
  }
}

function updateStats(lastUpdated) {
  document.getElementById('totalRecipes').textContent = allRecipes.length;
  document.getElementById('totalCategories').textContent = categories.length;
  document.getElementById('lastUpdated').textContent = new Date(lastUpdated).toLocaleDateString();
}

function renderRecipes(recipes) {
  const grid = document.getElementById('recipes-grid');
  grid.innerHTML = '';

  if (recipes.length === 0) {
    grid.innerHTML = '<p class="no-results">No recipes match your search.</p>';
    return;
  }

  for (const recipe of recipes) {
    const card = document.createElement('div');
    card.className = 'recipe-card';

    const tags = recipe.tags.map((tag) => `<span class="tag">${tag}</span>`).join('');

    const versions =
      Array.isArray(recipe.versions) && recipe.versions.length > 0
        ? recipe.versions
        : [{ version: recipe.version, manifestUrl: recipe.manifestUrl }];
    const latest = versions[0];

    const versionControl =
      versions.length > 1
        ? `<select class="version-select">${versions
            .map((v) => `<option value="${v.version}">v${v.version}</option>`)
            .join('')}</select>`
        : `<span>v${latest.version}</span>`;

    card.innerHTML = `
      <div class="recipe-info">
        <div class="recipe-header">
          <h3 class="recipe-name">${recipe.name}</h3>
          <span class="recipe-category">${recipe.categoryName}</span>
        </div>
        <p class="recipe-description">${recipe.description}</p>
        <div class="recipe-tags">${tags}</div>
        <div class="recipe-meta">
          ${versionControl}
          <span>${recipe.author}</span>
        </div>
        <div class="manifest-url">
          <code>${latest.manifestUrl}</code>
          <button class="copy-button" data-url="${latest.manifestUrl}">Copy</button>
        </div>
      </div>
    `;

    const select = card.querySelector('.version-select');
    if (select) {
      select.addEventListener('change', () => {
        const chosen = versions.find((v) => v.version === select.value) ?? latest;
        card.querySelector('.manifest-url code').textContent = chosen.manifestUrl;
        card.querySelector('.copy-button').dataset.url = chosen.manifestUrl;
      });
    }

    grid.appendChild(card);
  }

  grid.querySelectorAll('.copy-button').forEach((button) => {
    button.addEventListener('click', () => {
      navigator.clipboard.writeText(button.dataset.url);
      button.textContent = 'Copied';
      setTimeout(() => (button.textContent = 'Copy'), 1500);
    });
  });
}

function applyFilters() {
  const query = document.getElementById('searchInput').value.toLowerCase();
  const category = document.getElementById('categoryFilter').value;

  const filtered = allRecipes.filter((recipe) => {
    const matchesQuery =
      !query ||
      recipe.name.toLowerCase().includes(query) ||
      recipe.description.toLowerCase().includes(query) ||
      recipe.tags.some((tag) => tag.toLowerCase().includes(query)) ||
      recipe.author.toLowerCase().includes(query);

    const matchesCategory = !category || recipe.type === category;

    return matchesQuery && matchesCategory;
  });

  renderRecipes(filtered);
}

document.getElementById('searchInput').addEventListener('input', applyFilters);
document.getElementById('categoryFilter').addEventListener('change', applyFilters);

loadRecipes();
