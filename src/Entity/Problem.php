<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Post;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Delete;
use ApiPlatform\Doctrine\Orm\Filter\SearchFilter;
use ApiPlatform\Metadata\ApiFilter;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;

#[ORM\Entity]
#[ApiResource(
    operations: [
        new Get(),
        new GetCollection(),
        new Post(),
        new Patch(),
        new Delete()
    ],
    normalizationContext: ['groups' => ['problem:read']],
    denormalizationContext: ['groups' => ['problem:write']]
)]
#[ApiFilter(SearchFilter::class, properties: [
    'detectedIn.flock' => 'exact', // 👈 On filtre via l'observation d'origine
    'status' => 'exact'
])]
class Problem
{
    public const STATUS_OPEN = 'open';
    public const STATUS_RESOLVED = 'resolved';

    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    #[Groups(['problem:read', 'observation:read', 'visit:read'])]
    private ?int $id = null;

    #[ORM\Column(type: Types::TEXT)]
    #[Groups(['problem:read', 'problem:write', 'observation:read', 'visit:read','observation:write'])]
    private ?string $description = null;

    #[ORM\Column(length: 20, options: ['default' => self::STATUS_OPEN])]
    #[Groups(['problem:read', 'problem:write', 'observation:read', 'visit:read','observation:write'])]
    private ?string $status = self::STATUS_OPEN;

    #[ORM\Column(length: 20, nullable: true)]
    #[Groups(['problem:read', 'problem:write', 'observation:read','observation:write'])]
    private ?string $severity = 'medium';

    // --- RELATIONS ---

    // 1. L'observation où le problème a été VU (Obligatoire)
    #[ORM\ManyToOne(inversedBy: 'detectedProblems')]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    #[Groups(['problem:read', 'problem:write', 'observation:read', 'visit:read','observation:write'])]
    private ?Observation $detectedIn = null;

    // 2. L'observation où le problème a été RÉSOLU (Optionnel)
    #[ORM\ManyToOne(inversedBy: 'resolvedProblems')]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    #[Groups(['problem:read', 'problem:write', 'observation:read', 'visit:read','observation:write'])]
    private ?Observation $resolvedIn = null;

    // --- DATES ---

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    #[Groups(['problem:read', 'observation:read'])]
    private ?\DateTimeImmutable $createdAt = null;

    #[ORM\Column(type: Types::DATETIME_MUTABLE, nullable: true)]
    #[Groups(['problem:read', 'problem:write'])]
    private ?\DateTimeInterface $resolvedAt = null;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    // --- GETTERS & SETTERS ---

    public function getId(): ?int { return $this->id; }

    public function getDescription(): ?string { return $this->description; }
    public function setDescription(string $description): self { $this->description = $description; return $this; }

    public function getStatus(): ?string { return $this->status; }
    public function setStatus(string $status): self {
        $this->status = $status;
        // Auto-remplissage de la date si résolu
        if ($status === self::STATUS_RESOLVED && !$this->resolvedAt) {
            $this->resolvedAt = new \DateTime();
        }
        return $this;
    }

    public function getSeverity(): ?string { return $this->severity; }
    public function setSeverity(?string $severity): self { $this->severity = $severity; return $this; }

    public function getDetectedIn(): ?Observation { return $this->detectedIn; }
    public function setDetectedIn(?Observation $detectedIn): self { $this->detectedIn = $detectedIn; return $this; }

    public function getResolvedIn(): ?Observation { return $this->resolvedIn; }
    public function setResolvedIn(?Observation $resolvedIn): self { 
        $this->resolvedIn = $resolvedIn;
        // Si on lie une observation de résolution, on passe automatiquement le statut à résolu
        if ($resolvedIn) {
            $this->setStatus(self::STATUS_RESOLVED);
        }
        return $this; 
    }

    public function getCreatedAt(): ?\DateTimeImmutable { return $this->createdAt; }
    public function getResolvedAt(): ?\DateTimeInterface { return $this->resolvedAt; }
}