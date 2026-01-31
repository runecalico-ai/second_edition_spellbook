# End-to-End Publishing Flow (Specialty Priest)

**This is the intended operational flow tying everything together.**

1.  **Create / Update Spell Lists**

    -   Core divine list

    -   Deity-specific list (owner_type = DEITY)

2.  **Define or Update Base Class**

    -   Cleric or hybrid divine class

    -   Explicit sphere model

    -   Spell list policy = MIXED

3.  **Create Class Bundle**

    -   Select base class

    -   Select deity

    -   Enforce portfolio constraints

    -   Overlay deity spell list

    -   Apply sphere overrides

4.  **Validate Bundle**

    -   Spell resolution

    -   Sphere legality

    -   Portfolio consistency

5.  **Publish Bundle**

    -   Immutable

    -   Versioned

    -   Safe for characters

6.  **Character Creation Consumes Bundle**

    -   No dynamic logic

    -   Fully resolved data