async function getAPIData() {
        let url = "/api/randomRecipes";
        let response = await fetch(url);
        let data = await response.json();

        let grid = document.getElementById("recipeGrid");
        grid.innerHTML = "";

        data.forEach(recipe => {
            let card = `
                <a href="/recipe?id=${recipe.id}" class="recipeLink">
                    <div class="recipeCard">
                        <img src="${recipe.image_url}" class="recipeCardImg">
                        <div class="cardBody">
                            <span class="badge">${recipe.area}</span>
                            <h4>${recipe.recipe_name}</h4>
                        </div>
                    </div>
                </a>`;

            grid.innerHTML += card;
        });
    }

    getAPIData();