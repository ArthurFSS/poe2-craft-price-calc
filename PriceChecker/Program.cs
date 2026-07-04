using System.Text;
using System.Text.Json;

const string League = "Runes of Aldur";

// Key = Nome utilizado na API do poe.ninja
// Value = Nome que será salvo no JSON/CSV
var Types = new Dictionary<string, string>
{
    { "Currency",   "Currency" },
    { "Ritual",     "Omen" },
    { "Abyss",      "Abyss" },
    { "Essences",   "Essence" },
    { "Runes",      "Sockets" },
    { "Verisium",   "Verisium" },
    { "Expedition", "Expedition" },
    { "Breach",     "Breach" },
    { "Delirium",   "Delirium" }
};

var client = new HttpClient();

client.DefaultRequestHeaders.Add("User-Agent", "PoE2 Craft Calculator");

var database = new Dictionary<string, Item>();

foreach (var type in Types)
{
    var apiType = type.Key;
    var sourceName = type.Value;

    Console.WriteLine($"Baixando {apiType}...");

    var url =
        $"https://poe.ninja/poe2/api/economy/exchange/current/overview?league={Uri.EscapeDataString(League)}&type={Uri.EscapeDataString(apiType)}";

    try
    {
        var json = await client.GetStringAsync(url);

        using var doc = JsonDocument.Parse(json);

        var root = doc.RootElement;

        JsonElement items;

        if (!root.TryGetProperty("items", out items))
            items = root.GetProperty("core").GetProperty("items");

        var prices = new Dictionary<string, JsonElement>();

        foreach (var line in root.GetProperty("lines").EnumerateArray())
        {
            prices[line.GetProperty("id").GetString()!] = line;
        }

        foreach (var item in items.EnumerateArray())
        {
            var id = item.GetProperty("id").GetString()!;

            prices.TryGetValue(id, out var price);

            database[id] = new Item
            {
                Source = sourceName,
                Id = id,
                Name = item.GetProperty("name").GetString() ?? "",
                Category = sourceName,//item.GetProperty("category").GetString() ?? "",
                DetailsId = item.GetProperty("detailsId").GetString() ?? "",
                Image = item.GetProperty("image").GetString() ?? "",
                Price = price.ValueKind != JsonValueKind.Undefined
                    ? price.GetProperty("primaryValue").GetDouble()
                    : 0,
                Volume = price.ValueKind != JsonValueKind.Undefined
                    ? price.GetProperty("volumePrimaryValue").GetDouble()
                    : 0
            };
        }

        Console.WriteLine($"  OK ({database.Count} itens acumulados)");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Erro em {apiType}");
        Console.WriteLine(ex.Message);
    }
}

Console.WriteLine();
Console.WriteLine("Gerando CSV...");

var csv = new StringBuilder();

csv.AppendLine("Source\tName\tId\tCategory\tPrice\tVolume\tDetailsId\tImage");

foreach (var item in database.Values
             .OrderBy(i => i.Source)
             .ThenBy(i => i.Name))
{
    csv.AppendLine(string.Join('\t',
        Escape(item.Source),
        Escape(item.Name),
        Escape(item.Id),
        Escape(item.Category),
        item.Price.ToString(System.Globalization.CultureInfo.InvariantCulture),
        item.Volume.ToString(System.Globalization.CultureInfo.InvariantCulture),
        Escape(item.DetailsId),
        Escape(item.Image)
    ));
}

File.WriteAllText("prices.csv", csv.ToString(), Encoding.UTF8);

Console.WriteLine("CSV salvo.");

Console.WriteLine("Gerando JSON...");

var options = new JsonSerializerOptions
{
    WriteIndented = true
};

File.WriteAllText(
    "prices.json",
    JsonSerializer.Serialize(
        database.Values
            .OrderBy(i => i.Source)
            .ThenBy(i => i.Name),
        options));

Console.WriteLine();
Console.WriteLine($"Concluído!");
Console.WriteLine($"Itens: {database.Count}");

static string Escape(string? value)
{
    return value?.Replace("\t", " ") ?? "";
}

record Item
{
    public string Source { get; set; } = "";
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Category { get; set; } = "";
    public string DetailsId { get; set; } = "";
    public string Image { get; set; } = "";
    public double Price { get; set; }
    public double Volume { get; set; }
}