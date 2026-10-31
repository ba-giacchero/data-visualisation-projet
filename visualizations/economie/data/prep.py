"""
construire les deux fichiers de la visu économie
Entrées : donnees_brutes/ + noc_iso3.csv + para_nom_iso3.csv
Sorties : /data/olympiques.csv et /data/paralympiques.csv
  une ligne par pays et par édition : saison, annee, pays, iso3, medailles, athletes, gdppc
"""
import os
import pandas as pd

D = "../../../donnees_brutes"
T = "../../../tables_code_pays"
COLONNES = ["saison", "annee", "pays", "iso3", "medailles", "athletes", "gdppc"]

# ---------- PIB Maddison : (iso3, annee) -> gdppc ----------
pib = pd.read_excel(f"{D}/mpd2023_web.xlsx", sheet_name="Full data")
pib = pib.rename(columns={"countrycode": "iso3", "year": "annee"})[["iso3", "annee", "gdppc"]]
pib = pib[(pib["annee"] >= 1960) & pib["gdppc"].notna()]


def ajouter_iso3_et_pib(df, table, cle):
    """Ajoute iso3 (via la table de correspondance) puis gdppc (via Maddison)."""
    df["iso3"] = df["pays"].map(dict(zip(table[cle], table["iso3"])))
    manquants = df.loc[df["iso3"].isna(), "pays"].unique()
    if len(manquants):
        raise SystemExit(f"Pays absents de la table de correspondance : {list(manquants)}")
    return df.merge(pib, on=["iso3", "annee"], how="left")


# ---------- Olympiques : compter par pays et par édition ----------
jo = pd.read_csv(f"{D}/Olympic_Athlete_Event_Results.csv")
jo = jo[jo["edition"].str.contains("Summer Olympics|Winter Olympics")]
jo["annee"] = jo["edition"].str[:4].astype(int)
jo = jo[jo["annee"] >= 1960]
jo["saison"] = jo["edition"].str.contains("Summer").map({True: "ete", False: "hiver"})
jo = jo.rename(columns={"country_noc": "pays"})
groupe = ["saison", "annee", "pays"]

# Athlètes : identifiants uniques (un athlète inscrit à 3 épreuves compte 1 fois)
athletes = jo.groupby(groupe)["athlete_id"].nunique().rename("athletes")

# Médailles : une médaille = un triplet (épreuve, pays, couleur) unique
# -> les 11 joueurs d'une équipe de football championne donnent 1 seule médaille
medailles = (jo[jo["medal"].notna()]
             .drop_duplicates(["result_id", "pays", "medal"])
             .groupby(groupe).size().rename("medailles"))

olymp = pd.concat([athletes, medailles], axis=1).fillna({"medailles": 0}).reset_index()
olymp["medailles"] = olymp["medailles"].astype(int)
olymp = ajouter_iso3_et_pib(olymp, pd.read_csv(f"{T}/noc_iso3.csv"), "noc")

# ---------- Paralympiques : déjà agrégé, on additionne ----------
para = pd.read_csv(f"{D}/paralympic_games.csv")
para["saison"] = para["games_type"].map({"Summer": "ete", "Winter": "hiver"})
para["medailles"] = para["gold"] + para["silver"] + para["bronze"]
para["athletes"] = para["participants_men"] + para["participants_women"]
para = para.rename(columns={"year": "annee", "country": "pays"})
para = ajouter_iso3_et_pib(para, pd.read_csv(f"{T}/para_nom_iso3.csv"), "country")

# ---------- Écriture ----------
os.makedirs("../data", exist_ok=True)
olymp[COLONNES].sort_values(groupe).to_csv("olympiques.csv", index=False)
para[COLONNES].sort_values(groupe).to_csv("paralympiques.csv", index=False)


print("\nCouverture PIB : % des médailles des pays ayant un PIB, par édition")
for nom, df in [("Olympiques", olymp), ("Paralympiques", para)]:
    df = df[df["iso3"] != "exclu"]
    couv = (df[df["gdppc"].notna()].groupby(["saison", "annee"])["medailles"].sum()
            / df.groupby(["saison", "annee"])["medailles"].sum() * 100).round(1)
    print(f"  {nom} : min {couv.min()} %, éditions sous 95 % : {couv[couv < 95].to_dict()}")

