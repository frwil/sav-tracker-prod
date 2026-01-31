<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use App\Repository\PortfolioHistoryRepository;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;

#[ORM\Entity(repositoryClass: PortfolioHistoryRepository::class)]
#[ApiResource(
    operations: [
        new Get(),
        new GetCollection()
    ],
    normalizationContext: ['groups' => ['portfolio:read']],
    order: ['startDate' => 'DESC']
)]
class PortfolioHistory
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    #[Groups(['portfolio:read'])]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false)]
    #[Groups(['portfolio:read'])]
    private ?User $technician = null;

    #[ORM\ManyToOne(targetEntity: Customer::class)]
    #[ORM\JoinColumn(nullable: false)]
    #[Groups(['portfolio:read'])]
    private ?Customer $customer = null;

    #[ORM\Column(type: Types::DATETIME_MUTABLE)]
    #[Groups(['portfolio:read'])]
    private ?\DateTimeInterface $startDate = null;

    #[ORM\Column(type: Types::DATETIME_MUTABLE, nullable: true)]
    #[Groups(['portfolio:read'])]
    private ?\DateTimeInterface $endDate = null;

    public function __construct(User $technician, Customer $customer)
    {
        $this->technician = $technician;
        $this->customer = $customer;
        $this->startDate = new \DateTime();
    }

    public function close(): void
    {
        $this->endDate = new \DateTime();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getTechnician(): ?User
    {
        return $this->technician;
    }

    public function getCustomer(): ?Customer
    {
        return $this->customer;
    }

    public function getStartDate(): ?\DateTimeInterface
    {
        return $this->startDate;
    }

    public function getEndDate(): ?\DateTimeInterface
    {
        return $this->endDate;
    }
}