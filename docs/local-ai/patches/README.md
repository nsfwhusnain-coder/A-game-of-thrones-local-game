# Patches for the game (not applied)

Ready-to-apply changes behind R2, R7 and R8 in [RECOMMENDATIONS.md](../RECOMMENDATIONS.md). Each applies cleanly to game commit `255b302`. From the repository root:

    git apply --ignore-whitespace docs/local-ai/patches/R8-men-count-number-words.patch

(`--ignore-whitespace` because Windows checkouts may convert line endings.) Measured effect of each is in the recommendation; the numbers are in [RESULTS.md](../RESULTS.md).
